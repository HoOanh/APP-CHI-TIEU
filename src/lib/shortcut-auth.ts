import { createHash, randomBytes } from 'node:crypto';
import type { Client } from '@libsql/client';

export interface ShortcutAuthContext {
  keyId: number;
  userId: number;
  ledgerId: number;
  defaultAccountId: number | null;
}

export function hashShortcutToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

export function generateShortcutToken(): {
  rawToken: string;
  keyPrefix: string;
  keyHash: string;
} {
  const random = randomBytes(24).toString('base64url');
  const rawToken = `arc_sk_${random}`;
  return {
    rawToken,
    keyPrefix: rawToken.slice(0, 14),
    keyHash: hashShortcutToken(rawToken),
  };
}

export async function authenticateShortcutBearer(
  db: Client,
  authorizationHeader: string | null,
): Promise<ShortcutAuthContext | null> {
  if (!authorizationHeader) return null;
  const match = authorizationHeader.match(/^Bearer\s+(arc_sk_[A-Za-z0-9_-]{12,128})$/);
  if (!match) return null;

  const keyHash = hashShortcutToken(match[1]);
  const res = await db.execute({
    sql: `SELECT id, user_id, ledger_id, default_account_id
          FROM shortcut_keys
          WHERE key_hash = ? AND revoked_at IS NULL
          LIMIT 1`,
    args: [keyHash],
  });
  const row = res.rows[0];
  if (!row) return null;

  const keyId = Number(row.id);
  await db.execute({
    sql: "UPDATE shortcut_keys SET last_used_at = datetime('now') WHERE id = ?",
    args: [keyId],
  }).catch(() => {});

  return {
    keyId,
    userId: Number(row.user_id),
    ledgerId: Number(row.ledger_id),
    defaultAccountId: row.default_account_id !== null && row.default_account_id !== undefined
      ? Number(row.default_account_id)
      : null,
  };
}
