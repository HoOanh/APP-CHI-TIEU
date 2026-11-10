import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/current-user';
import { getVietnamToday } from '@/lib/utils';
import { z } from 'zod';

const paymentSchema = z.object({
  amount: z.coerce.number().finite().positive(),
  payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  note: z.string().max(500).optional(),
});

interface RouteContext { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const db = await getDb();
    const payments = await db.execute({ sql: 'SELECT * FROM debt_payments WHERE debt_id = ? AND user_id = ? ORDER BY payment_date DESC', args: [id, user.id] });
    return NextResponse.json(payments.rows);
  } catch (error) {
    console.error(error);
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
    const parsed = paymentSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Số tiền hoặc ngày thanh toán không hợp lệ' }, { status: 400 });
    }
    const { amount, payment_date, note } = parsed.data;
    const db = await getDb();

    const ownedDebt = await db.execute({
      sql: 'SELECT total_amount FROM debts WHERE id = ? AND user_id = ?',
      args: [id, user.id],
    });
    if (!ownedDebt.rows[0]) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    
    const tx = await db.transaction('write');
    
    await tx.execute({ sql: 'INSERT INTO debt_payments (user_id, debt_id, amount, payment_date, note) VALUES (?, ?, ?, ?, ?)', args: [user.id, id, amount, payment_date || getVietnamToday(), note || ''] });
    
    const debtRes = await tx.execute({ sql: 'SELECT total_amount FROM debts WHERE id = ? AND user_id = ?', args: [id, user.id] });
    const paidRes = await tx.execute({ sql: 'SELECT SUM(amount) as sum FROM debt_payments WHERE debt_id = ? AND user_id = ?', args: [id, user.id] });
    
    const totalAmount = Number(debtRes.rows[0]?.total_amount || 0);
    const totalPaid = Number(paidRes.rows[0]?.sum || 0);
    
    if (totalPaid >= totalAmount) {
      await tx.execute({ sql: "UPDATE debts SET status = 'completed' WHERE id = ? AND user_id = ?", args: [id, user.id] });
    } else {
      await tx.execute({ sql: "UPDATE debts SET status = 'active' WHERE id = ? AND user_id = ?", args: [id, user.id] });
    }
    
    await tx.commit();
    
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to create payment' }, { status: 500 });
  }
}
