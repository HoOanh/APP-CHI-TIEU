import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/current-user';

interface RouteContext { params: Promise<{ id: string }> }

const updateCategorySchema = z.object({
  name: z.string().trim().min(1, 'Tên danh mục là bắt buộc').max(60, 'Tên danh mục tối đa 60 ký tự'),
  icon: z.string().trim().min(1).max(40).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  kind: z.enum(['expense', 'income', 'both']).optional(),
});

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const rawBody: unknown = await request.json().catch(() => null);
    const parsed = updateCategorySchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Dữ liệu danh mục không hợp lệ' }, { status: 400 });
    }
    const { name, icon, color, kind } = parsed.data;
    
    const db = await getDb();
    const existing = await db.execute({
      sql: 'SELECT id, icon, color, kind FROM categories WHERE id = ? AND user_id = ?',
      args: [id, user.id],
    });
    const current = existing.rows[0];
    if (!current) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const duplicate = await db.execute({
      sql: `SELECT id FROM categories
            WHERE (user_id IS NULL OR user_id = ?) AND lower(name) = lower(?) AND id <> ?
            LIMIT 1`,
      args: [user.id, name, id],
    });
    if (duplicate.rows[0]) {
      return NextResponse.json({ error: 'Tên danh mục đã tồn tại' }, { status: 409 });
    }

    await db.execute({
      sql: 'UPDATE categories SET name = ?, icon = ?, color = ?, kind = ? WHERE id = ? AND user_id = ?',
      args: [
        name,
        icon ?? String(current.icon || 'category'),
        color ?? String(current.color || '#64748b'),
        kind ?? String(current.kind || 'expense'),
        id,
        user.id,
      ]
    });
    
    const updated = await db.execute({
      sql: 'SELECT *, user_id IS NULL as is_system FROM categories WHERE id = ? AND user_id = ?',
      args: [id, user.id]
    });

    if (!updated.rows[0]) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    
    return NextResponse.json(updated.rows[0]);
  } catch (error) {
    if (error instanceof Error && /UNIQUE constraint failed/i.test(error.message)) {
      return NextResponse.json({ error: 'Tên danh mục đã tồn tại' }, { status: 409 });
    }
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
