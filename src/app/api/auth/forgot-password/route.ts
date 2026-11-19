import { createHash, randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import { sendPasswordResetEmail } from '@/lib/mailer';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

const forgotSchema = z.object({
  email: z.string().trim().email(),
});

const TOKEN_TTL_MINUTES = 30;

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const rate = checkRateLimit(`forgot-password:${ip}`, 5, 15 * 60_000);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } },
    );
  }

  const rawBody: unknown = await request.json().catch(() => null);
  const parsed = forgotSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Vui lòng nhập email hợp lệ.' }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase();

  try {
    const db = await getDb();
    const userResult = await db.execute({
      sql: 'SELECT id, name, email FROM users WHERE email = ? LIMIT 1',
      args: [email],
    });
    const user = userResult.rows[0];

    if (user) {
      const rawToken = randomBytes(32).toString('base64url');
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60_000)
        .toISOString()
        .slice(0, 19)
        .replace('T', ' ');

      await db.batch(
        [
          {
            sql: `UPDATE auth_tokens
                  SET used_at = COALESCE(used_at, datetime('now'))
                  WHERE email = ? AND purpose = 'password_reset' AND used_at IS NULL`,
            args: [email],
          },
          {
            sql: `INSERT INTO auth_tokens (user_id, email, purpose, token_hash, expires_at)
                  VALUES (?, ?, 'password_reset', ?, ?)`,
            args: [Number(user.id), email, tokenHash, expiresAt],
          },
        ],
        'write',
      );

      const baseUrl = process.env.NEXTAUTH_URL || request.nextUrl.origin;
      const resetUrl = new URL('/reset-password', baseUrl);
      resetUrl.searchParams.set('token', rawToken);

      await sendPasswordResetEmail({
        to: email,
        name: String(user.name || ''),
        resetUrl: resetUrl.toString(),
      });
    }

    // Always return neutral 200 to prevent account enumeration.
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[forgot-password]', error);
    return NextResponse.json(
      { error: 'Không thể gửi email đặt lại mật khẩu lúc này.' },
      { status: 500 },
    );
  }
}
