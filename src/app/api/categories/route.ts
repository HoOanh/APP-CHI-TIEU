import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/current-user';

const createCategorySchema = z.object({
  name: z.string().trim().min(1, 'Tên danh mục là bắt buộc').max(60, 'Tên danh mục tối đa 60 ký tự'),
  icon: z.string().trim().max(40).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  kind: z.enum(['expense', 'income', 'both']).optional(),
});

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = await getDb();
    const result = await db.execute({
      sql: `SELECT c.id, c.user_id, c.ledger_id,
                   COALESCE(co.name, c.name) AS name,
                   COALESCE(co.icon, c.icon) AS icon,
                   COALESCE(co.color, c.color) AS color,
                   COALESCE(co.kind, c.kind) AS kind,
                   c.budget_group, c.created_at,
                   c.user_id IS NULL AS is_system
            FROM categories c
            LEFT JOIN category_overrides co ON co.category_id = c.id AND co.user_id = ?
            WHERE c.user_id IS NULL OR c.user_id = ?
            ORDER BY COALESCE(co.name, c.name) ASC`,
      args: [user.id, user.id],
    });
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rawBody: unknown = await request.json().catch(() => null);
    const parsed = createCategorySchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Dữ liệu danh mục không hợp lệ' }, { status: 400 });
    }

    const normalizedName = parsed.data.name;
    const normalizedIcon = parsed.data.icon && parsed.data.icon.length > 0 ? parsed.data.icon : 'tag';
    const normalizedColor = parsed.data.color ?? '#00B878';
    const normalizedKind = parsed.data.kind ?? 'expense';

    const db = await getDb();
    const existing = await db.execute({
      sql: `SELECT c.id FROM categories c
            LEFT JOIN category_overrides co ON co.category_id = c.id AND co.user_id = ?
            WHERE (c.user_id IS NULL OR c.user_id = ?) AND lower(COALESCE(co.name, c.name)) = lower(?)
            LIMIT 1`,
      args: [user.id, user.id, normalizedName],
    });
    if (existing.rows[0]) {
      return NextResponse.json({ error: 'Tên danh mục đã tồn tại' }, { status: 409 });
    }

    const result = await db.execute({
      sql: 'INSERT INTO categories (user_id, name, icon, color, kind) VALUES (?, ?, ?, ?, ?)',
      args: [user.id, normalizedName, normalizedIcon, normalizedColor, normalizedKind],
    });

    const newCategory = await db.execute({
      sql: 'SELECT *, user_id IS NULL as is_system FROM categories WHERE id = ? AND user_id = ?',
      args: [result.lastInsertRowid!, user.id],
    });

    return NextResponse.json(newCategory.rows[0], { status: 201 });
  } catch (error) {
    if (error instanceof Error && /UNIQUE constraint failed/i.test(error.message)) {
      return NextResponse.json({ error: 'Tên danh mục đã tồn tại' }, { status: 409 });
    }
    console.error(error);
    return NextResponse.json({ error: 'Failed to create category' }, { status: 500 });
  }
}
