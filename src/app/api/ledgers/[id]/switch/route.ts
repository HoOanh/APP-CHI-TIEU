import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/current-user';
import { getDb } from '@/lib/db';
import { assertLedgerAccess, LedgerAccessError } from '@/lib/ledger-access';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await context.params;
    const ledgerId = Number(id);
    const db = await getDb();
    const grant = await assertLedgerAccess(db, user.id, ledgerId, 'viewer');

    await db.execute({
      sql: `INSERT INTO user_profiles (user_id, primary_persona, personas_json, enabled_modules_json, active_ledger_id, updated_at)
            VALUES (?, 'speed_tracker', '["speed_tracker"]', '{}', ?, datetime('now'))
            ON CONFLICT(user_id) DO UPDATE SET
              active_ledger_id = excluded.active_ledger_id,
              updated_at = datetime('now')`,
      args: [user.id, grant.ledgerId],
    });

    return NextResponse.json({
      ok: true,
      activeLedgerId: grant.ledgerId,
      ledgerName: grant.ledgerName,
      role: grant.role,
    });
  } catch (error) {
    if (error instanceof LedgerAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Không thể chuyển sổ.' }, { status: 500 });
  }
}
