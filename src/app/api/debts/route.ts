import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/current-user';
import { getVietnamToday } from '@/lib/utils';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = await getDb();
    const query = `
      SELECT d.*, 
      COALESCE((SELECT SUM(amount) FROM debt_payments dp WHERE dp.user_id = d.user_id AND dp.debt_id = d.id), 0) as paid_amount,
      d.total_amount - COALESCE((SELECT SUM(amount) FROM debt_payments dp WHERE dp.user_id = d.user_id AND dp.debt_id = d.id), 0) as remaining_amount
      FROM debts d
      WHERE d.user_id = ?
      ORDER BY 
        CASE WHEN status = 'active' THEN 0 ELSE 1 END,
        created_at DESC
    `;
    const debts = await db.execute({ sql: query, args: [user.id] });
    return NextResponse.json(debts.rows);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to fetch debts' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: unknown = await request.json();
    if (!isRecord(body)) return NextResponse.json({ error: 'Dữ liệu công nợ không hợp lệ.' }, { status: 400 });
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const creditor = typeof body.creditor === 'string' ? body.creditor.trim() : '';
    const totalAmount = Number(body.total_amount);
    const interestRate = Number(body.interest_rate) || 0;
    const startDate = body.start_date || getVietnamToday();
    const dueDate = body.due_date;
    const note = typeof body.note === 'string' ? body.note.trim() : '';
    if (!name || !creditor || !Number.isFinite(totalAmount) || totalAmount <= 0 || !isValidDate(startDate) || !isValidDate(dueDate) || !Number.isFinite(interestRate) || interestRate < 0) {
      return NextResponse.json({ error: 'Kiểm tra tên, chủ nợ, số tiền và ngày bắt đầu/ngày hạn.' }, { status: 400 });
    }
    const db = await getDb();
    
    const info = await db.execute({
      sql: `
        INSERT INTO debts (user_id, name, creditor, total_amount, interest_rate, start_date, due_date, note)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [user.id, name, creditor, totalAmount, interestRate, startDate, dueDate, note]
    });
    
    const newDebt = await db.execute({ sql: 'SELECT * FROM debts WHERE id = ? AND user_id = ?', args: [info.lastInsertRowid!, user.id] });
    return NextResponse.json(newDebt.rows[0], { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to create debt' }, { status: 500 });
  }
}

function isValidDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
