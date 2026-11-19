import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/current-user';
import { getDb } from '@/lib/db';
import { assertLedgerAccess, LedgerAccessError } from '@/lib/ledger-access';

const updateMemberSchema = z.object({
  role: z.enum(['editor', 'viewer']),
});

interface RouteContext {
  params: Promise<{ id: string; memberUserId: string }>;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id, memberUserId } = await context.params;
    const ledgerId = Number(id);
    const targetUserId = Number(memberUserId);
    const rawBody: unknown = await request.json().catch(() => null);
    const parsed = updateMemberSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Vai trò không hợp lệ.' }, { status: 400 });
    }

    const db = await getDb();
    const grant = await assertLedgerAccess(db, user.id, ledgerId, 'owner');
    if (targetUserId === grant.ownerId) {
      return NextResponse.json({ error: 'Không thể hạ quyền của Chủ sổ.' }, { status: 400 });
    }

    const res = await db.execute({
      sql: 'UPDATE ledger_members SET role = ? WHERE ledger_id = ? AND user_id = ?',
      args: [parsed.data.role, ledgerId, targetUserId],
    });
    if (!res.rowsAffected) {
      return NextResponse.json({ error: 'Không tìm thấy thành viên.' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof LedgerAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Không thể cập nhật thành viên.' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id, memberUserId } = await context.params;
    const ledgerId = Number(id);
    const targetUserId = Number(memberUserId);
    const db = await getDb();

    // Allow self-leave OR owner removal
    if (targetUserId !== user.id) {
      await assertLedgerAccess(db, user.id, ledgerId, 'owner');
    } else {
      await assertLedgerAccess(db, user.id, ledgerId, 'viewer');
    }

    const ledgerRes = await db.execute({
      sql: 'SELECT owner_id FROM ledgers WHERE id = ? LIMIT 1',
      args: [ledgerId],
    });
    if (Number(ledgerRes.rows[0]?.owner_id) === targetUserId) {
      return NextResponse.json({ error: 'Chủ sổ không thể rời khỏi sổ mình sở hữu.' }, { status: 400 });
    }

    await db.batch([
      {
        sql: 'DELETE FROM ledger_members WHERE ledger_id = ? AND user_id = ?',
        args: [ledgerId, targetUserId],
      },
      {
        sql: 'UPDATE user_profiles SET active_ledger_id = NULL WHERE user_id = ? AND active_ledger_id = ?',
        args: [targetUserId, ledgerId],
      },
    ], 'write');

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof LedgerAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Không thể xóa thành viên.' }, { status: 500 });
  }
}
