import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/current-user';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const debt_id = request.nextUrl.searchParams.get('debt_id');
    const month = request.nextUrl.searchParams.get('month');
    
    const db = await getDb();
    let query = `
      SELECT dj.*, d.name as debt_name,
      COALESCE((SELECT SUM(amount) FROM debt_payments dp WHERE dp.user_id = dj.user_id AND dp.debt_id = dj.debt_id AND strftime('%Y-%m', dp.payment_date) = dj.month), 0) as actual_paid
      FROM debt_jars dj
      JOIN debts d ON dj.debt_id = d.id
      WHERE dj.user_id = ?
    `;
    const params: (string | number)[] = [user.id];
    if (debt_id) {
      query += ` AND dj.debt_id = ?`;
      params.push(debt_id);
    }
    if (month) {
      query += ` AND dj.month = ?`;
      params.push(month);
    }
    
    const jars = await db.execute({ sql: query, args: params });
    return NextResponse.json(jars.rows);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to fetch debt jars' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { debt_id, month, planned_amount } = await request.json();
    const db = await getDb();
    
    const ownedDebt = await db.execute({
      sql: 'SELECT id FROM debts WHERE id = ? AND user_id = ?',
      args: [debt_id, user.id],
    });
    if (!ownedDebt.rows[0]) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const existingResult = await db.execute({ sql: 'SELECT id FROM debt_jars WHERE user_id = ? AND debt_id = ? AND month = ?', args: [user.id, debt_id, month] });
    
    if (existingResult.rows.length > 0) {
      const existingId = existingResult.rows[0].id;
      await db.execute({ sql: 'UPDATE debt_jars SET planned_amount = ? WHERE id = ? AND user_id = ?', args: [planned_amount, existingId, user.id] });
      return NextResponse.json({ id: existingId, debt_id, month, planned_amount });
    } else {
      const info = await db.execute({ sql: 'INSERT INTO debt_jars (user_id, debt_id, month, planned_amount) VALUES (?, ?, ?, ?)', args: [user.id, debt_id, month, planned_amount] });
      return NextResponse.json({ id: Number(info.lastInsertRowid), debt_id, month, planned_amount }, { status: 201 });
    }
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to save debt jar' }, { status: 500 });
  }
}
