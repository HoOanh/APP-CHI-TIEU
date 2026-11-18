import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { hashPassword } from '@/lib/password';

interface RegisterBody {
  name?: unknown;
  email?: unknown;
  password?: unknown;
}

export async function POST(request: NextRequest) {
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
      return NextResponse.json({ error: 'Email này đã được đăng ký.' }, { status: 409 });
    }

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error('[register]', error);
    return NextResponse.json({ error: 'Không thể tạo tài khoản.' }, { status: 500 });
  }
}
