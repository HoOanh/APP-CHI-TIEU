import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/current-user';
import { getDb } from '@/lib/db';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: 'ID không hợp lệ.' }, { status: 400 });
  }

  const db = await getDb();
  const res = await db.execute({
    sql: `UPDATE shortcut_keys
          SET revoked_at = COALESCE(revoked_at, datetime('now'))
          WHERE id = ? AND user_id = ? AND revoked_at IS NULL`,
    args: [Number(id), user.id],
  });

  if (!res.rowsAffected) {
    return NextResponse.json({ error: 'Không tìm thấy khóa hoặc khóa đã thu hồi.' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
