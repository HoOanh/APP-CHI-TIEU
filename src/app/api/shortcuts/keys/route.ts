import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/current-user';
import { getDb } from '@/lib/db';
import { ensureUserLedgerAndAccount } from '@/lib/ledger-context';
import { generateShortcutToken } from '@/lib/shortcut-auth';

const createKeySchema = z.object({
  name: z.string().trim().min(1, 'Nhập tên phím tắt').max(60),
  default_account_id: z.coerce.number().int().positive().nullable().optional(),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = await getDb();
  const res = await db.execute({
    sql: `SELECT sk.id, sk.name, sk.key_prefix, sk.default_account_id, sk.last_used_at, sk.revoked_at, sk.created_at,
                 a.name AS account_name
          FROM shortcut_keys sk
          LEFT JOIN accounts a ON a.id = sk.default_account_id
          WHERE sk.user_id = ? AND sk.revoked_at IS NULL
          ORDER BY sk.created_at DESC, sk.id DESC`,
    args: [user.id],
  });

  return NextResponse.json(
    res.rows.map((row) => ({
      id: Number(row.id),
      name: String(row.name),
      key_prefix: String(row.key_prefix),
      default_account_id: row.default_account_id !== null && row.default_account_id !== undefined
        ? Number(row.default_account_id)
        : null,
      account_name: row.account_name ? String(row.account_name) : null,
      last_used_at: row.last_used_at ? String(row.last_used_at) : null,
      created_at: String(row.created_at),
    })),
  );
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rawBody: unknown = await request.json().catch(() => null);
  const parsed = createKeySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'Thông tin khóa Shortcuts không hợp lệ.' },
      { status: 400 },
    );
  }

  const db = await getDb();
  const { ledgerId, defaultAccountId } = await ensureUserLedgerAndAccount(db, user.id);
  const targetAccountId = parsed.data.default_account_id ?? defaultAccountId;

  const { rawToken, keyPrefix, keyHash } = generateShortcutToken();
  const res = await db.execute({
    sql: `INSERT INTO shortcut_keys (user_id, ledger_id, default_account_id, name, key_prefix, key_hash)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [user.id, ledgerId, targetAccountId, parsed.data.name, keyPrefix, keyHash],
  });

  return NextResponse.json(
    {
      id: Number(res.lastInsertRowid),
      name: parsed.data.name,
      key_prefix: keyPrefix,
      token: rawToken,
      default_account_id: targetAccountId,
    },
    { status: 201 },
  );
}
