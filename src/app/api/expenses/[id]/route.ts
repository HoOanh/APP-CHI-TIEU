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
    const payload = await request.json() as {
      amount?: unknown;
      description?: unknown;
      note?: unknown;
      category_id?: unknown;
      expense_date?: unknown;
      type?: unknown;
    };
    const amount = Number(payload.amount);
    const description = typeof payload.description === 'string' ? payload.description.trim() : '';
    const categoryId = Number(payload.category_id);
    const expenseDate = payload.expense_date;
    const type = payload.type === 'income' ? 'income' : 'expense';
    if (!Number.isFinite(amount) || amount <= 0 || !description || description.length > 160 || !Number.isInteger(categoryId) || categoryId <= 0 || !isValidDate(expenseDate) || (payload.type !== 'income' && payload.type !== 'expense')) {
      return NextResponse.json({ error: 'Thông tin giao dịch chưa hợp lệ.' }, { status: 400 });
    }
    
    const db = await getDb();
    const category = await db.execute({
      sql: 'SELECT id FROM categories WHERE id = ? AND (user_id IS NULL OR user_id = ?)',
      args: [categoryId, user.id],
    });
    if (!category.rows[0]) return NextResponse.json({ error: 'Danh mục không hợp lệ.' }, { status: 400 });
    await db.execute({
      sql: `
        UPDATE expenses 
        SET amount = ?, description = ?, note = ?, category_id = ?, expense_date = ?, type = ?
        WHERE id = ? AND user_id = ?
      `,
      args: [amount, description, typeof payload.note === 'string' ? payload.note.trim() : '', categoryId, expenseDate, type, id, user.id]
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

function isValidDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
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
