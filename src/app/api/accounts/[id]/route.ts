import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/current-user';
import { getDb } from '@/lib/db';
import { assertLedgerAccess, LedgerAccessError } from '@/lib/ledger-access';
import { ensureUserLedgerAndAccount } from '@/lib/ledger-context';

type RouteContext = { params: Promise<{ id: string }> };

const patchAccountSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  type: z.enum(['cash', 'bank', 'ewallet', 'credit_card', 'savings']).optional(),
  initial_balance: z.coerce.number().finite().min(-10_000_000_000).max(10_000_000_000).optional(),
  credit_limit: z.coerce.number().finite().min(0).max(10_000_000_000).optional(),
  statement_day: z.coerce.number().int().min(0).max(28).optional(),
  due_day: z.coerce.number().int().min(0).max(28).optional(),
  is_default: z.boolean().optional(),
  archived: z.boolean().optional(),
});

export async function PATCH(request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: rawId } = await context.params;
  const accountId = Number(rawId);
  if (!Number.isInteger(accountId) || accountId <= 0) {
    return NextResponse.json({ error: 'Ví không hợp lệ.' }, { status: 400 });
  }

  const rawBody: unknown = await request.json().catch(() => null);
  const parsed = patchAccountSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dữ liệu cập nhật ví không hợp lệ.' }, { status: 400 });
  }

  const db = await getDb();
  const { ledgerId } = await ensureUserLedgerAndAccount(db, user.id);
  try {
    await assertLedgerAccess(db, user.id, ledgerId, 'editor');
  } catch (error) {
    if (error instanceof LedgerAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
  const existingRes = await db.execute({
    sql: 'SELECT id, is_default, archived FROM accounts WHERE id = ? AND ledger_id = ? LIMIT 1',
    args: [accountId, ledgerId],
  });
  const current = existingRes.rows[0];
  if (!current) {
    return NextResponse.json({ error: 'Không tìm thấy ví.' }, { status: 404 });
  }

  const data = parsed.data;
  if (data.name) {
    const duplicate = await db.execute({
      sql: 'SELECT id FROM accounts WHERE ledger_id = ? AND lower(name) = lower(?) AND archived = 0 AND id <> ? LIMIT 1',
      args: [ledgerId, data.name, accountId],
    });
    if (duplicate.rows[0]) {
      return NextResponse.json({ error: 'Tên ví này đã tồn tại.' }, { status: 409 });
    }
  }

  if (data.archived === true) {
    const activeOthers = await db.execute({
      sql: 'SELECT id FROM accounts WHERE ledger_id = ? AND archived = 0 AND id <> ? ORDER BY is_default DESC, id ASC',
      args: [ledgerId, accountId],
    });
    if (activeOthers.rows.length === 0) {
      return NextResponse.json({ error: 'Cần giữ lại ít nhất một ví đang hoạt động.' }, { status: 400 });
    }
    if (Number(current.is_default) === 1) {
      await db.execute({
        sql: 'UPDATE accounts SET is_default = 1 WHERE id = ? AND ledger_id = ?',
        args: [Number(activeOthers.rows[0].id), ledgerId],
      });
    }
  }

  const tx = await db.transaction('write');
  try {
    if (data.is_default === true) {
      await tx.execute({
        sql: 'UPDATE accounts SET is_default = 0 WHERE ledger_id = ?',
        args: [ledgerId],
      });
    }

    const updates: string[] = [];
    const args: Array<string | number> = [];
    if (data.name !== undefined) { updates.push('name = ?'); args.push(data.name); }
    if (data.type !== undefined) { updates.push('type = ?'); args.push(data.type); }
    if (data.initial_balance !== undefined) { updates.push('initial_balance = ?'); args.push(data.initial_balance); }
    if (data.credit_limit !== undefined) { updates.push('credit_limit = ?'); args.push(data.credit_limit); }
    if (data.statement_day !== undefined) { updates.push('statement_day = ?'); args.push(data.statement_day); }
    if (data.due_day !== undefined) { updates.push('due_day = ?'); args.push(data.due_day); }
    if (data.is_default !== undefined) { updates.push('is_default = ?'); args.push(data.is_default ? 1 : 0); }
    if (data.archived !== undefined) {
      updates.push('archived = ?');
      args.push(data.archived ? 1 : 0);
      if (data.archived) {
        updates.push('is_default = 0');
      }
    }

    if (updates.length) {
      args.push(accountId, ledgerId);
      await tx.execute({
        sql: `UPDATE accounts SET ${updates.join(', ')} WHERE id = ? AND ledger_id = ?`,
        args,
      });
    }

    await tx.commit();
  } catch (error) {
    await tx.rollback().catch(() => {});
    throw error;
  }

  return NextResponse.json({ ok: true });
}
