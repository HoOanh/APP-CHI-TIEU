import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/current-user';
import { getDb } from '@/lib/db';
import { ensureUserLedgerAndAccount } from '@/lib/ledger-context';
import { getVietnamToday } from '@/lib/utils';

const createRecurringSchema = z.object({
  title: z.string().trim().min(1, 'Nhập tên khoản nhắc hẹn').max(120),
  amount: z.coerce.number().finite().positive('Số tiền phải lớn hơn 0'),
  type: z.enum(['expense', 'income', 'debt_payment']).optional().default('expense'),
  category_id: z.coerce.number().int().positive().nullable().optional(),
  account_id: z.coerce.number().int().positive().nullable().optional(),
  debt_id: z.coerce.number().int().positive().nullable().optional(),
  cadence: z.enum(['weekly', 'monthly', 'yearly']).optional().default('monthly'),
  day_of_month: z.coerce.number().int().min(1).max(28).optional().default(1),
  day_of_week: z.coerce.number().int().min(1).max(7).optional().default(1),
  next_due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  remind_days_before: z.coerce.number().int().min(0).max(14).optional().default(0),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = await getDb();
  const { ledgerId } = await ensureUserLedgerAndAccount(db, user.id);

  const res = await db.execute({
    sql: `SELECT r.*, c.name AS category_name, c.color AS category_color,
                 a.name AS account_name, d.name AS debt_name
          FROM recurring_rules r
          LEFT JOIN categories c ON c.id = r.category_id
          LEFT JOIN accounts a ON a.id = r.account_id
          LEFT JOIN debts d ON d.id = r.debt_id
          WHERE r.ledger_id = ? OR r.user_id = ?
          ORDER BY r.enabled DESC, r.next_due_date ASC, r.id DESC`,
    args: [ledgerId, user.id],
  });

  return NextResponse.json(
    res.rows.map((row) => ({
      id: Number(row.id),
      title: String(row.title),
      amount: Number(row.amount) || 0,
      type: String(row.type),
      category_id: row.category_id !== null && row.category_id !== undefined ? Number(row.category_id) : null,
      category_name: row.category_name ? String(row.category_name) : null,
      category_color: row.category_color ? String(row.category_color) : null,
      account_id: row.account_id !== null && row.account_id !== undefined ? Number(row.account_id) : null,
      account_name: row.account_name ? String(row.account_name) : null,
      debt_id: row.debt_id !== null && row.debt_id !== undefined ? Number(row.debt_id) : null,
      debt_name: row.debt_name ? String(row.debt_name) : null,
      cadence: String(row.cadence),
      day_of_month: Number(row.day_of_month) || 1,
      day_of_week: Number(row.day_of_week) || 1,
      next_due_date: String(row.next_due_date),
      remind_days_before: Number(row.remind_days_before) || 0,
      enabled: Number(row.enabled) === 1,
    })),
  );
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rawBody: unknown = await request.json().catch(() => null);
  const parsed = createRecurringSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'Dữ liệu lịch nhắc không hợp lệ.' },
      { status: 400 },
    );
  }

  const db = await getDb();
  const { ledgerId, defaultAccountId } = await ensureUserLedgerAndAccount(db, user.id);
  const nextDue = parsed.data.next_due_date || getVietnamToday();

  const res = await db.execute({
    sql: `INSERT INTO recurring_rules
            (ledger_id, user_id, title, amount, type, category_id, account_id, debt_id,
             cadence, day_of_month, day_of_week, next_due_date, remind_days_before, enabled)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    args: [
      ledgerId,
      user.id,
      parsed.data.title,
      parsed.data.amount,
      parsed.data.type,
      parsed.data.category_id ?? null,
      parsed.data.account_id ?? defaultAccountId,
      parsed.data.debt_id ?? null,
      parsed.data.cadence,
      parsed.data.day_of_month,
      parsed.data.day_of_week,
      nextDue,
      parsed.data.remind_days_before,
    ],
  });

  return NextResponse.json(
    {
      id: Number(res.lastInsertRowid),
      title: parsed.data.title,
      amount: parsed.data.amount,
      next_due_date: nextDue,
    },
    { status: 201 },
  );
}
