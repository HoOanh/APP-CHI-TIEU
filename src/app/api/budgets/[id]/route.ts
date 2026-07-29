import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/current-user';

interface RouteContext { params: Promise<{ id: string }> }

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const { category_id, month, budget_amount, warning_percent } = await request.json();
    
    const db = await getDb();
    await db.execute({ sql: 'UPDATE budget_jars SET category_id = ?, month = ?, budget_amount = ?, warning_percent = ? WHERE id = ? AND user_id = ?', args: [category_id, month, budget_amount, warning_percent, id, user.id] });
    
    const updated = await db.execute({ sql: 'SELECT * FROM budget_jars WHERE id = ? AND user_id = ?', args: [id, user.id] });
    if (!updated.rows[0]) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json(updated.rows[0]);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to update budget' }, { status: 500 });
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
    await db.execute({ sql: 'DELETE FROM budget_jars WHERE id = ? AND user_id = ?', args: [id, user.id] });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to delete budget' }, { status: 500 });
  }
}
