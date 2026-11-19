import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/current-user';
import { getDb } from '@/lib/db';
import { hashPassword, verifyPassword } from '@/lib/password';

const patchProfileSchema = z.object({
  name: z.string().trim().min(1, 'Tên hiển thị không được để trống.').max(80).optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(10, 'Mật khẩu mới cần ít nhất 10 ký tự.').max(200).optional(),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = await getDb();
  const result = await db.execute({
    sql: 'SELECT password_hash, onboarded_at FROM users WHERE id = ? LIMIT 1',
    args: [user.id],
  });
  const row = result.rows[0];

  return NextResponse.json({
    name: user.name,
    email: user.email,
    image: user.image,
    isDevelopmentUser: user.isDevelopmentUser,
    hasPassword: Boolean(row?.password_hash),
    onboardedAt: row?.onboarded_at ? String(row.onboarded_at) : null,
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function PATCH(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rawBody: unknown = await request.json().catch(() => null);
  const parsed = patchProfileSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'Dữ liệu hồ sơ không hợp lệ.' },
      { status: 400 },
    );
  }

  const db = await getDb();
  const existingResult = await db.execute({
    sql: 'SELECT name, password_hash FROM users WHERE id = ? LIMIT 1',
    args: [user.id],
  });
  const existing = existingResult.rows[0];
  if (!existing) {
    return NextResponse.json({ error: 'Không tìm thấy tài khoản.' }, { status: 404 });
  }

  const updates: string[] = [];
  const args: Array<string | number> = [];

  if (parsed.data.name !== undefined) {
    updates.push('name = ?');
    args.push(parsed.data.name);
  }

  if (parsed.data.newPassword !== undefined) {
    if (user.isDevelopmentUser) {
      return NextResponse.json(
        { error: 'Không thể đổi mật khẩu ở chế độ local development.' },
        { status: 400 },
      );
    }

    const currentHash = existing.password_hash ? String(existing.password_hash) : '';
    if (currentHash) {
      if (!parsed.data.currentPassword || !(await verifyPassword(parsed.data.currentPassword, currentHash))) {
        return NextResponse.json({ error: 'Mật khẩu hiện tại không đúng.' }, { status: 400 });
      }
    }

    const nextHash = await hashPassword(parsed.data.newPassword);
    updates.push('password_hash = ?');
    args.push(nextHash);
  }

  if (!updates.length) {
    return NextResponse.json({ ok: true });
  }

  updates.push("updated_at = datetime('now')");
  args.push(user.id);

  await db.execute({
    sql: `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
    args,
  });

  return NextResponse.json({
    ok: true,
    hasPassword: parsed.data.newPassword ? true : Boolean(existing.password_hash),
  });
}
