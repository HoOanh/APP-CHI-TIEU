import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/current-user';

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

    const { name, creditor, total_amount, interest_rate, start_date, due_date, note } = await request.json();
    const db = await getDb();
    
    const info = await db.execute({
      sql: `
        INSERT INTO debts (user_id, name, creditor, total_amount, interest_rate, start_date, due_date, note)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [user.id, name, creditor, total_amount, interest_rate || 0, start_date, due_date || '', note || '']
    });
    
    const newDebt = await db.execute({ sql: 'SELECT * FROM debts WHERE id = ? AND user_id = ?', args: [info.lastInsertRowid!, user.id] });
    return NextResponse.json(newDebt.rows[0], { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to create debt' }, { status: 500 });
  }
}
