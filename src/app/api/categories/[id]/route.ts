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
    const { name, icon, color } = await request.json();
    
    const db = await getDb();
    await db.execute({
      sql: 'UPDATE categories SET name = ?, icon = ?, color = ? WHERE id = ? AND user_id = ?',
      args: [name, icon, color, id, user.id]
    });
    
    const updated = await db.execute({
      sql: 'SELECT * FROM categories WHERE id = ? AND user_id = ?',
      args: [id, user.id]
    });

    if (!updated.rows[0]) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    
    return NextResponse.json(updated.rows[0]);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to update category' }, { status: 500 });
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
    const categoryResult = await db.execute({
      sql: 'SELECT id FROM categories WHERE id = ? AND user_id = ?',
      args: [id, user.id],
    });
    if (!categoryResult.rows[0]) {
      return NextResponse.json({ error: 'Không thể xóa danh mục mặc định hoặc không tồn tại' }, { status: 404 });
    }

    const expenseCountResult = await db.execute({
      sql: 'SELECT COUNT(*) as count FROM expenses WHERE category_id = ? AND user_id = ?',
      args: [id, user.id]
    });

    const budgetCountResult = await db.execute({
      sql: 'SELECT COUNT(*) as count FROM budget_jars WHERE category_id = ? AND user_id = ?',
      args: [id, user.id]
    });

    const expenseCount = Number(expenseCountResult.rows[0]?.count ?? 0);
    const budgetCount = Number(budgetCountResult.rows[0]?.count ?? 0);

    if (expenseCount > 0 || budgetCount > 0) {
      return NextResponse.json({ error: 'Cannot delete category with existing expenses or budgets' }, { status: 400 });
    }
    
    await db.execute({
      sql: 'DELETE FROM categories WHERE id = ? AND user_id = ?',
      args: [id, user.id]
    });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to delete category' }, { status: 500 });
  }
}
