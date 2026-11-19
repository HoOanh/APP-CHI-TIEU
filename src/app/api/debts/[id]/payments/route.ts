import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/current-user';
import { getDb } from '@/lib/db';
import { recordDebtPaymentWithSync } from '@/lib/debt-payments-sync';

const paymentSchema = z.object({
  amount: z.coerce.number().finite().positive(),
  payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  note: z.string().max(500).optional(),
  account_id: z.coerce.number().int().positive().nullable().optional(),
  sync_to_expense: z.boolean().optional().default(true),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const db = await getDb();
    const payments = await db.execute({
      sql: `SELECT dp.id, dp.debt_id, dp.amount, dp.payment_date, dp.note, dp.account_id, dp.expense_id, dp.created_at,
                   a.name AS account_name
            FROM debt_payments dp
            LEFT JOIN accounts a ON a.id = dp.account_id
            WHERE dp.debt_id = ? AND dp.user_id = ?
            ORDER BY dp.payment_date DESC, dp.id DESC`,
      args: [id, user.id],
    });
    return NextResponse.json(payments.rows);
  } catch (error) {
    console.error('[GET /api/debts/[id]/payments]', error);
    return NextResponse.json({ error: 'Failed to fetch payments' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const rawBody: unknown = await request.json().catch(() => null);
    const parsed = paymentSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Số tiền hoặc ngày thanh toán không hợp lệ' }, { status: 400 });
    }

    const db = await getDb();
    const result = await recordDebtPaymentWithSync({
      db,
      userId: user.id,
      debtId: id,
      amount: parsed.data.amount,
      paymentDate: parsed.data.payment_date,
      note: parsed.data.note,
      accountId: parsed.data.account_id ?? null,
      syncToExpense: parsed.data.sync_to_expense,
      source: 'web',
    });

    if (!result) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, ...result }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/debts/[id]/payments]', error);
    return NextResponse.json({ error: 'Failed to create payment' }, { status: 500 });
  }
}
