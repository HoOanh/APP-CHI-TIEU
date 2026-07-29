import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/current-user';

interface RouteContext { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const db = await getDb();
    const query = `
      SELECT d.*, 
      COALESCE((SELECT SUM(amount) FROM debt_payments dp WHERE dp.user_id = d.user_id AND dp.debt_id = d.id), 0) as paid_amount
      FROM debts d WHERE d.id = ? AND d.user_id = ?
    `;
    const debt = await db.execute({ sql: query, args: [id, user.id] });
    
    if (debt.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(debt.rows[0]);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to fetch debt' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const { name, creditor, total_amount, interest_rate, start_date, due_date, note, status } = await request.json();
    const db = await getDb();
    
    await db.execute({
      sql: `
        UPDATE debts 
        SET name = ?, creditor = ?, total_amount = ?, interest_rate = ?, start_date = ?, due_date = ?, note = ?, status = COALESCE(?, status)
        WHERE id = ? AND user_id = ?
      `,
      args: [name, creditor, total_amount, interest_rate, start_date, due_date, note, status, id, user.id]
    });
    
    const updated = await db.execute({ sql: 'SELECT * FROM debts WHERE id = ? AND user_id = ?', args: [id, user.id] });
    if (!updated.rows[0]) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json(updated.rows[0]);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to update debt' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const db = await getDb();
    
    const stmts = [
      { sql: 'DELETE FROM debt_payments WHERE debt_id = ? AND user_id = ?', args: [id, user.id] },
      { sql: 'DELETE FROM debt_jars WHERE debt_id = ? AND user_id = ?', args: [id, user.id] },
      { sql: 'DELETE FROM debts WHERE id = ? AND user_id = ?', args: [id, user.id] }
    ];
    
    await db.batch(stmts, 'write');
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to delete debt' }, { status: 500 });
  }
}
