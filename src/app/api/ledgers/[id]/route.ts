import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/current-user';
import { getDb } from '@/lib/db';
import { assertLedgerAccess, LedgerAccessError } from '@/lib/ledger-access';

const updateLedgerSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  kind: z.enum(['personal', 'family', 'business']).optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await context.params;
    const ledgerId = Number(id);
    const db = await getDb();
    const grant = await assertLedgerAccess(db, user.id, ledgerId, 'viewer');

    const membersRes = await db.execute({
      sql: `SELECT lm.user_id, lm.role, lm.joined_at, u.name, u.email, u.avatar
            FROM ledger_members lm
            JOIN users u ON u.id = lm.user_id
            WHERE lm.ledger_id = ?
            ORDER BY CASE lm.role WHEN 'owner' THEN 0 WHEN 'editor' THEN 1 ELSE 2 END, lm.joined_at ASC`,
      args: [ledgerId],
    });

    return NextResponse.json({
      id: grant.ledgerId,
      name: grant.ledgerName,
      kind: grant.ledgerKind,
      role: grant.role,
      members: membersRes.rows.map((row) => ({
        user_id: Number(row.user_id),
        role: String(row.role),
        joined_at: String(row.joined_at),
        name: String(row.name || row.email),
        email: String(row.email),
        avatar: String(row.avatar || ''),
      })),
    });
  } catch (error) {
    if (error instanceof LedgerAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Không thể tải thông tin sổ.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await context.params;
    const ledgerId = Number(id);
    const rawBody: unknown = await request.json().catch(() => null);
    const parsed = updateLedgerSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Thông tin cập nhật không hợp lệ.' }, { status: 400 });
    }

    const db = await getDb();
    await assertLedgerAccess(db, user.id, ledgerId, 'owner');

    await db.execute({
      sql: 'UPDATE ledgers SET name = COALESCE(?, name), kind = COALESCE(?, kind) WHERE id = ?',
      args: [parsed.data.name ?? null, parsed.data.kind ?? null, ledgerId],
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof LedgerAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Không thể cập nhật sổ.' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await context.params;
    const ledgerId = Number(id);
    const db = await getDb();
    await assertLedgerAccess(db, user.id, ledgerId, 'owner');

    const countRes = await db.execute({
      sql: 'SELECT COUNT(*) AS cnt FROM ledgers WHERE owner_id = ?',
      args: [user.id],
    });
    if (Number(countRes.rows[0]?.cnt || 0) <= 1) {
      return NextResponse.json({ error: 'Không thể xóa sổ duy nhất của bạn.' }, { status: 400 });
    }

    await db.batch([
      {
        sql: 'UPDATE user_profiles SET active_ledger_id = NULL WHERE active_ledger_id = ?',
        args: [ledgerId],
      },
      {
        sql: 'DELETE FROM ledgers WHERE id = ?',
        args: [ledgerId],
      },
    ], 'write');

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof LedgerAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Không thể xóa sổ.' }, { status: 500 });
  }
}
