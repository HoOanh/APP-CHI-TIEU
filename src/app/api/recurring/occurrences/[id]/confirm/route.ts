import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/current-user';
import { getDb } from '@/lib/db';
import { recordDebtPaymentWithSync } from '@/lib/debt-payments-sync';
import { ensureUserLedgerAndAccount } from '@/lib/ledger-context';
import { advanceDueDate } from '@/lib/reminders-worker';
import { UNCLASSIFIED_EXPENSE } from '@/lib/schema';
import { getVietnamToday } from '@/lib/utils';

const confirmSchema = z.object({
  amount: z.coerce.number().finite().positive().optional(),
  account_id: z.coerce.number().int().positive().nullable().optional(),
  expense_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  note: z.string().max(500).optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'ID không hợp lệ.' }, { status: 400 });

  const rawBody: unknown = await request.json().catch(() => ({}));
  const parsed = confirmSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dữ liệu xác nhận không hợp lệ.' }, { status: 400 });
  }

  const db = await getDb();
  const ctx = await ensureUserLedgerAndAccount(db, user.id);

  const occRes = await db.execute({
    sql: `SELECT o.id, o.rule_id, o.due_date, o.status,
                 r.ledger_id, r.title, r.amount, r.type, r.category_id, r.account_id, r.debt_id, r.cadence, r.day_of_month
          FROM recurring_occurrences o
          JOIN recurring_rules r ON r.id = o.rule_id
          WHERE o.id = ? AND o.user_id = ? LIMIT 1`,
    args: [Number(id), user.id],
  });
  const occ = occRes.rows[0];
  if (!occ) return NextResponse.json({ error: 'Không tìm thấy nhắc hẹn.' }, { status: 404 });
  if (occ.status !== 'pending') {
    return NextResponse.json({ error: 'Nhắc hẹn này đã được xử lý trước đó.' }, { status: 409 });
  }

  const amount = parsed.data.amount ?? (Number(occ.amount) || 0);
  const accountId = parsed.data.account_id
    ?? (occ.account_id !== null && occ.account_id !== undefined ? Number(occ.account_id) : null)
    ?? ctx.defaultAccountId;
  const expenseDate = parsed.data.expense_date ?? getVietnamToday();
  const ruleType = String(occ.type);
  const ledgerId = Number(occ.ledger_id) || ctx.ledgerId;
  const cadence = (occ.cadence === 'weekly' || occ.cadence === 'yearly' ? occ.cadence : 'monthly') as
    | 'weekly'
    | 'monthly'
    | 'yearly';
  const nextDue = advanceDueDate(String(occ.due_date), cadence, Number(occ.day_of_month) || 1);

  if (ruleType === 'debt_payment' && occ.debt_id) {
    const syncRes = await recordDebtPaymentWithSync({
      db,
      userId: user.id,
      debtId: Number(occ.debt_id),
      amount,
      paymentDate: expenseDate,
      note: parsed.data.note || String(occ.title),
      accountId,
      syncToExpense: true,
      source: 'web',
    });
    if (!syncRes) return NextResponse.json({ error: 'Không tìm thấy khoản nợ liên kết.' }, { status: 404 });

    await db.batch([
      {
        sql: "UPDATE recurring_occurrences SET status = 'confirmed', expense_id = ?, resolved_at = datetime('now') WHERE id = ?",
        args: [syncRes.expenseId, Number(id)],
      },
      {
        sql: 'UPDATE recurring_rules SET next_due_date = ? WHERE id = ?',
        args: [nextDue, Number(occ.rule_id)],
      },
    ], 'write');
    return NextResponse.json({ ok: true, expenseId: syncRes.expenseId, nextDueDate: nextDue }, { status: 201 });
  }

  // Standard income / expense recurring confirmation
  const isIncome = ruleType === 'income';
  let categoryId = occ.category_id !== null && occ.category_id !== undefined ? Number(occ.category_id) : null;
  if (!categoryId) {
    const fallbackCat = await db.execute({
      sql: `SELECT id FROM categories WHERE (user_id IS NULL OR user_id = ?) AND name = ? LIMIT 1`,
      args: [user.id, isIncome ? 'Thu nhập' : UNCLASSIFIED_EXPENSE],
    });
    categoryId = fallbackCat.rows[0] ? Number(fallbackCat.rows[0].id) : null;
  }

  const tx = await db.transaction('write');
  try {
    const expRes = await tx.execute({
      sql: `INSERT INTO expenses
              (user_id, ledger_id, account_id, created_by_user_id, source, amount, description, note, category_id, expense_date, type)
            VALUES (?, ?, ?, ?, 'recurring', ?, ?, ?, ?, ?, ?)`,
      args: [
        user.id,
        ledgerId,
        accountId,
        user.id,
        amount,
        String(occ.title).slice(0, 160),
        (parsed.data.note || 'Xác nhận từ nhắc hẹn định kỳ').slice(0, 500),
        categoryId,
        expenseDate,
        isIncome ? 'income' : 'expense',
      ],
    });
    const expenseId = Number(expRes.lastInsertRowid);

    await tx.execute({
      sql: "UPDATE recurring_occurrences SET status = 'confirmed', expense_id = ?, resolved_at = datetime('now') WHERE id = ?",
      args: [expenseId, Number(id)],
    });
    await tx.execute({
      sql: 'UPDATE recurring_rules SET next_due_date = ? WHERE id = ?',
      args: [nextDue, Number(occ.rule_id)],
    });

    await tx.commit();
    return NextResponse.json({ ok: true, expenseId, nextDueDate: nextDue }, { status: 201 });
  } catch (err) {
    await tx.rollback().catch(() => {});
    throw err;
  }
}
