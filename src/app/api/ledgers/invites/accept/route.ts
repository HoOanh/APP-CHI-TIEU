import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/current-user';
import { getDb } from '@/lib/db';
import { parseEnabledModulesJson } from '@/lib/modules';

const acceptSchema = z.object({
  token: z.string().trim().min(10, 'Token lời mời không hợp lệ'),
});

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rawBody: unknown = await request.json().catch(() => null);
  const parsed = acceptSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Token lời mời không hợp lệ.' }, { status: 400 });
  }

  const db = await getDb();
  const tokenHash = createHash('sha256').update(parsed.data.token).digest('hex');

  const res = await db.execute({
    sql: `SELECT id, email, metadata_json, expires_at, used_at
          FROM auth_tokens
          WHERE token_hash = ? AND purpose = 'ledger_invite'
          LIMIT 1`,
    args: [tokenHash],
  });
  const tokenRow = res.rows[0];
  if (!tokenRow) {
    return NextResponse.json({ error: 'Lời mời không tồn tại hoặc đã hết hiệu lực.' }, { status: 404 });
  }
  if (tokenRow.used_at) {
    return NextResponse.json({ error: 'Lời mời này đã được sử dụng.' }, { status: 409 });
  }
  if (String(tokenRow.expires_at) <= new Date().toISOString()) {
    return NextResponse.json({ error: 'Lời mời đã hết hạn.' }, { status: 410 });
  }

  const invitedEmail = String(tokenRow.email || '');
  if (invitedEmail !== 'link-invite' && invitedEmail.toLowerCase() !== user.email.toLowerCase()) {
    return NextResponse.json({ error: `Lời mời này được gửi riêng cho email ${invitedEmail}.` }, { status: 403 });
  }

  let metadata: { ledgerId?: number; ledgerName?: string; role?: string } = {};
  try {
    metadata = JSON.parse(String(tokenRow.metadata_json || '{}')) as {
      ledgerId?: number;
      ledgerName?: string;
      role?: string;
    };
  } catch {
    return NextResponse.json({ error: 'Dữ liệu lời mời bị lỗi.' }, { status: 400 });
  }

  const ledgerId = Number(metadata.ledgerId || 0);
  const role = metadata.role === 'viewer' ? 'viewer' : 'editor';
  if (!ledgerId) {
    return NextResponse.json({ error: 'Không tìm thấy sổ đích.' }, { status: 404 });
  }

  const ledgerCheck = await db.execute({
    sql: 'SELECT id, name FROM ledgers WHERE id = ? LIMIT 1',
    args: [ledgerId],
  });
  if (!ledgerCheck.rows[0]) {
    return NextResponse.json({ error: 'Sổ này không còn tồn tại.' }, { status: 404 });
  }

  const nextModules = parseEnabledModulesJson(JSON.stringify({ ...user.modules, shared_ledgers: true }), user.personas);

  const tx = await db.transaction('write');
  try {
    await tx.execute({
      sql: `INSERT INTO ledger_members (ledger_id, user_id, role)
            VALUES (?, ?, ?)
            ON CONFLICT(ledger_id, user_id) DO UPDATE SET
              role = CASE WHEN ledger_members.role = 'owner' THEN 'owner' ELSE excluded.role END`,
      args: [ledgerId, user.id, role],
    });

    await tx.execute({
      sql: `INSERT INTO user_profiles (user_id, primary_persona, personas_json, enabled_modules_json, active_ledger_id, updated_at)
            VALUES (?, 'speed_tracker', '["speed_tracker"]', ?, ?, datetime('now'))
            ON CONFLICT(user_id) DO UPDATE SET
              enabled_modules_json = excluded.enabled_modules_json,
              active_ledger_id = excluded.active_ledger_id,
              updated_at = datetime('now')`,
      args: [user.id, JSON.stringify(nextModules), ledgerId],
    });

    await tx.execute({
      sql: "UPDATE users SET onboarded_at = COALESCE(onboarded_at, datetime('now')) WHERE id = ?",
      args: [user.id],
    });
    await tx.execute({
      sql: "UPDATE auth_tokens SET used_at = datetime('now') WHERE id = ?",
      args: [Number(tokenRow.id)],
    });

    await tx.commit();
    return NextResponse.json({
      ok: true,
      ledgerId,
      ledgerName: String(ledgerCheck.rows[0].name),
      role,
    });
  } catch (err) {
    await tx.rollback().catch(() => {});
    throw err;
  }
}
