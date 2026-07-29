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
    const result = await db.execute({
      sql: `SELECT *, user_id IS NULL as is_system
            FROM categories
            WHERE user_id IS NULL OR user_id = ?
            ORDER BY name ASC`,
      args: [user.id]
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

    const { name, icon, color } = await request.json();
    if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    
    const db = await getDb();
    const result = await db.execute({
      sql: 'INSERT INTO categories (user_id, name, icon, color) VALUES (?, ?, ?, ?)',
      args: [user.id, name, icon || '📦', color || '#64748b']
    });
    
    const newCategory = await db.execute({
      sql: 'SELECT * FROM categories WHERE id = ? AND user_id = ?',
      args: [result.lastInsertRowid!, user.id]
    });
    
    return NextResponse.json(newCategory.rows[0], { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to create category' }, { status: 500 });
  }
}
