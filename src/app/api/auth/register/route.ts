import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { hashPassword } from '@/lib/password';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

interface RegisterBody {
  name?: unknown;
  email?: unknown;
  password?: unknown;
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const rate = checkRateLimit(`register:${ip}`, 5, 15 * 60_000);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Bạn đăng ký quá nhiều lần. Vui lòng thử lại sau ít phút.' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } },
    );
  }

  try {
    const body = await request.json() as RegisterBody;
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!name || name.length > 80 || !/^\S+@\S+\.\S+$/.test(email) || password.length < 10) {
      return NextResponse.json(
        { error: 'Nhập tên, email hợp lệ và mật khẩu từ 10 ký tự.' },
        { status: 400 },
      );
    }

    const passwordHash = await hashPassword(password);
    const db = await getDb();
    const result = await db.execute({
      sql: `INSERT INTO users (email, name, avatar, password_hash)
            VALUES (?, ?, '', ?)
            ON CONFLICT(email) DO NOTHING
            RETURNING id`,
      args: [email, name, passwordHash],
    });

    if (!result.rows[0]) {
      const existing = await db.execute({
        sql: 'SELECT password_hash FROM users WHERE email = ? LIMIT 1',
        args: [email],
      });
      const message = existing.rows[0] && !existing.rows[0].password_hash
        ? 'Email này đã liên kết Google. Hãy đăng nhập bằng Google hoặc dùng Quên mật khẩu để tạo mật khẩu.'
        : 'Email này đã được đăng ký.';
      return NextResponse.json({ error: message }, { status: 409 });
    }

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error('[register]', error);
    return NextResponse.json({ error: 'Không thể tạo tài khoản.' }, { status: 500 });
  }
}
