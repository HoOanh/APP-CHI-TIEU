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
    const { amount, description, note, category_id, expense_date } = await request.json();
    
    const db = await getDb();
    await db.execute({
      sql: `
        UPDATE expenses 
        SET amount = ?, description = ?, note = ?, category_id = ?, expense_date = ? 
        WHERE id = ? AND user_id = ?
      `,
      args: [amount, description, note, category_id, expense_date, id, user.id]
    });
    
    const updated = await db.execute({
      sql: `
        SELECT e.*, c.name as category_name, c.icon as category_icon, c.color as category_color 
        FROM expenses e 
        LEFT JOIN categories c ON e.category_id = c.id 
        WHERE e.id = ? AND e.user_id = ?
      `,
      args: [id, user.id]
    });

    if (!updated.rows[0]) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    
    return NextResponse.json(updated.rows[0]);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to update expense' }, { status: 500 });
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
    await db.execute({
      sql: 'DELETE FROM expenses WHERE id = ? AND user_id = ?',
      args: [id, user.id]
    });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to delete expense' }, { status: 500 });
  }
}
