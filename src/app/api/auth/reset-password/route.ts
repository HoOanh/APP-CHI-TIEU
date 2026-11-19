import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import { hashPassword } from '@/lib/password';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

const resetSchema = z.object({
  token: z.string().trim().min(16),
  password: z.string().min(10, 'Mật khẩu cần ít nhất 10 ký tự.').max(200),
});

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const rate = checkRateLimit(`reset-password:${ip}`, 10, 15 * 60_000);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Bạn thao tác quá nhanh. Vui lòng thử lại sau.' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } },
    );
  }

  const rawBody: unknown = await request.json().catch(() => null);
  const parsed = resetSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'Liên kết hoặc mật khẩu không hợp lệ.' },
      { status: 400 },
    );
  }

  const tokenHash = createHash('sha256').update(parsed.data.token).digest('hex');

  try {
    const db = await getDb();
    const tokenResult = await db.execute({
      sql: `SELECT id, user_id, email
            FROM auth_tokens
            WHERE token_hash = ?
              AND purpose = 'password_reset'
              AND used_at IS NULL
              AND expires_at > datetime('now')
            LIMIT 1`,
      args: [tokenHash],
    });
    const tokenRow = tokenResult.rows[0];
    if (!tokenRow || !tokenRow.user_id) {
      return NextResponse.json(
        { error: 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.' },
        { status: 400 },
      );
    }

    const passwordHash = await hashPassword(parsed.data.password);
    const tx = await db.transaction('write');
    try {
      const claimResult = await tx.execute({
        sql: `UPDATE auth_tokens
              SET used_at = datetime('now')
              WHERE id = ? AND used_at IS NULL`,
        args: [Number(tokenRow.id)],
      });
      if (Number(claimResult.rowsAffected) !== 1) {
        await tx.rollback();
        return NextResponse.json(
          { error: 'Liên kết đặt lại mật khẩu đã được sử dụng.' },
          { status: 400 },
        );
      }

      await tx.execute({
        sql: `UPDATE users
              SET password_hash = ?, updated_at = datetime('now')
              WHERE id = ?`,
        args: [passwordHash, Number(tokenRow.user_id)],
      });
      await tx.commit();
    } catch (txError) {
      await tx.rollback().catch(() => {});
      throw txError;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[reset-password]', error);
    return NextResponse.json({ error: 'Không thể đặt lại mật khẩu.' }, { status: 500 });
  }
}
