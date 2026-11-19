import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/current-user';
import { getDb } from '@/lib/db';
import { ensureUserLedgerAndAccount } from '@/lib/ledger-context';

const createLedgerSchema = z.object({
  name: z.string().trim().min(1, 'Nhập tên sổ tài chính').max(60),
  kind: z.enum(['personal', 'family', 'business']).optional().default('family'),
  switchTo: z.boolean().optional().default(true),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = await getDb();
  const ctx = await ensureUserLedgerAndAccount(db, user.id);

  const res = await db.execute({
    sql: `SELECT l.id, l.owner_id, l.name, l.kind, l.currency, l.created_at,
                 COALESCE(lm.role, CASE WHEN l.owner_id = ? THEN 'owner' ELSE 'viewer' END) AS role,
                 (SELECT COUNT(*) FROM ledger_members lm2 WHERE lm2.ledger_id = l.id) AS member_count
          FROM ledgers l
          LEFT JOIN ledger_members lm ON lm.ledger_id = l.id AND lm.user_id = ?
          WHERE l.owner_id = ? OR lm.user_id = ?
          ORDER BY CASE WHEN l.id = ? THEN 0 ELSE 1 END, l.id ASC`,
    args: [user.id, user.id, user.id, user.id, ctx.ledgerId],
  });

  return NextResponse.json({
    activeLedgerId: ctx.ledgerId,
    ledgers: res.rows.map((row) => ({
      id: Number(row.id),
      owner_id: Number(row.owner_id),
      name: String(row.name),
      kind: row.kind === 'family' || row.kind === 'business' ? row.kind : 'personal',
      currency: String(row.currency || 'VND'),
      role: row.role === 'owner' || row.role === 'editor' ? row.role : 'viewer',
      member_count: Math.max(1, Number(row.member_count) || 1),
      is_active: Number(row.id) === ctx.ledgerId,
      created_at: String(row.created_at),
    })),
  });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rawBody: unknown = await request.json().catch(() => null);
  const parsed = createLedgerSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'Thông tin sổ không hợp lệ.' },
      { status: 400 },
    );
  }

  const db = await getDb();
  await ensureUserLedgerAndAccount(db, user.id);

  const tx = await db.transaction('write');
  try {
    const ledgerRes = await tx.execute({
      sql: "INSERT INTO ledgers (owner_id, name, kind, currency) VALUES (?, ?, ?, 'VND')",
      args: [user.id, parsed.data.name, parsed.data.kind],
    });
    const newLedgerId = Number(ledgerRes.lastInsertRowid);

    await tx.execute({
      sql: "INSERT INTO ledger_members (ledger_id, user_id, role) VALUES (?, ?, 'owner')",
      args: [newLedgerId, user.id],
    });
    await tx.execute({
      sql: "INSERT INTO accounts (ledger_id, user_id, name, type, initial_balance, is_default) VALUES (?, ?, 'Ví chính', 'cash', 0, 1)",
      args: [newLedgerId, user.id],
    });

    if (parsed.data.switchTo) {
      await tx.execute({
        sql: "UPDATE user_profiles SET active_ledger_id = ?, updated_at = datetime('now') WHERE user_id = ?",
        args: [newLedgerId, user.id],
      });
    }

    await tx.commit();
    return NextResponse.json(
      {
        id: newLedgerId,
        name: parsed.data.name,
        kind: parsed.data.kind,
        role: 'owner',
        is_active: parsed.data.switchTo,
      },
      { status: 201 },
    );
  } catch (err) {
    await tx.rollback().catch(() => {});
    throw err;
  }
}
