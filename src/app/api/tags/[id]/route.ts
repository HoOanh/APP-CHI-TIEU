import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/current-user';
import { getDb } from '@/lib/db';
import { assertLedgerAccess, LedgerAccessError } from '@/lib/ledger-access';
import { ensureUserLedgerAndAccount } from '@/lib/ledger-context';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await context.params;
    const tagId = Number(id);
    if (!Number.isInteger(tagId) || tagId <= 0) {
      return NextResponse.json({ error: 'Tag không hợp lệ.' }, { status: 400 });
    }

    const db = await getDb();
    const { ledgerId } = await ensureUserLedgerAndAccount(db, user.id);
    await assertLedgerAccess(db, user.id, ledgerId, 'editor');

    const res = await db.execute({
      sql: 'DELETE FROM tags WHERE id = ? AND ledger_id = ?',
      args: [tagId, ledgerId],
    });
    if (Number(res.rowsAffected) === 0) {
      return NextResponse.json({ error: 'Không tìm thấy tag.' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof LedgerAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Không thể xóa tag.' }, { status: 500 });
  }
}
