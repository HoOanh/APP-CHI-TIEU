import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/current-user';
import { getDb } from '@/lib/db';
import { ensureUserLedgerAndAccount } from '@/lib/ledger-context';

const createAccountSchema = z.object({
  name: z.string().trim().min(1, 'Nhập tên ví').max(60),
  type: z.enum(['cash', 'bank', 'ewallet', 'credit_card', 'savings']).default('cash'),
  initial_balance: z.coerce.number().finite().min(-10_000_000_000).max(10_000_000_000).default(0),
  credit_limit: z.coerce.number().finite().min(0).max(10_000_000_000).optional().default(0),
  statement_day: z.coerce.number().int().min(0).max(28).optional().default(0),
  due_day: z.coerce.number().int().min(0).max(28).optional().default(0),
  is_default: z.boolean().optional().default(false),
});

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const includeArchived = request.nextUrl.searchParams.get('includeArchived') === '1';
  const db = await getDb();
  const { ledgerId } = await ensureUserLedgerAndAccount(db, user.id);

  const result = await db.execute({
    sql: `SELECT a.id, a.ledger_id, a.name, a.type, a.initial_balance, a.credit_limit,
                 a.statement_day, a.due_day, a.is_default, a.archived, a.created_at,
                 (
                   a.initial_balance
                   + COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.ledger_id = a.ledger_id AND e.account_id = a.id AND e.type = 'income'), 0)
                   - COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.ledger_id = a.ledger_id AND e.account_id = a.id AND e.type = 'expense'), 0)
                   + COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.ledger_id = a.ledger_id AND e.to_account_id = a.id AND e.type = 'transfer'), 0)
                   - COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.ledger_id = a.ledger_id AND e.account_id = a.id AND e.type = 'transfer'), 0)
                 ) AS balance
          FROM accounts a
          WHERE a.ledger_id = ? AND (? = 1 OR a.archived = 0)
          ORDER BY a.archived ASC, a.is_default DESC, a.id ASC`,
    args: [ledgerId, includeArchived ? 1 : 0],
  });

  const items = result.rows.map((row) => ({
    id: Number(row.id),
    ledger_id: Number(row.ledger_id),
    name: String(row.name),
    type: String(row.type),
    initial_balance: Number(row.initial_balance) || 0,
    credit_limit: Number(row.credit_limit) || 0,
    statement_day: Number(row.statement_day) || 0,
    due_day: Number(row.due_day) || 0,
    is_default: Number(row.is_default) === 1,
    archived: Number(row.archived) === 1,
    balance: Number(row.balance) || 0,
    created_at: String(row.created_at),
  }));

  return NextResponse.json(items, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rawBody: unknown = await request.json().catch(() => null);
  const parsed = createAccountSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'Thông tin ví không hợp lệ.' },
      { status: 400 },
    );
  }

  const db = await getDb();
  const { ledgerId } = await ensureUserLedgerAndAccount(db, user.id);
  const data = parsed.data;

  const duplicate = await db.execute({
    sql: 'SELECT id FROM accounts WHERE ledger_id = ? AND lower(name) = lower(?) AND archived = 0 LIMIT 1',
    args: [ledgerId, data.name],
  });
  if (duplicate.rows[0]) {
    return NextResponse.json({ error: 'Tên ví này đã tồn tại.' }, { status: 409 });
  }

  const tx = await db.transaction('write');
  let newId = 0;
  try {
    if (data.is_default) {
      await tx.execute({
        sql: 'UPDATE accounts SET is_default = 0 WHERE ledger_id = ?',
        args: [ledgerId],
      });
    }
    const inserted = await tx.execute({
      sql: `INSERT INTO accounts (ledger_id, user_id, name, type, initial_balance, credit_limit, statement_day, due_day, is_default)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        ledgerId,
        user.id,
        data.name,
        data.type,
        data.initial_balance,
        data.credit_limit,
        data.statement_day,
        data.due_day,
        data.is_default ? 1 : 0,
      ],
    });
    newId = Number(inserted.lastInsertRowid);
    await tx.commit();
  } catch (error) {
    await tx.rollback().catch(() => {});
    throw error;
  }

  return NextResponse.json({
    id: newId,
    ledger_id: ledgerId,
    name: data.name,
    type: data.type,
    initial_balance: data.initial_balance,
    credit_limit: data.credit_limit,
    statement_day: data.statement_day,
    due_day: data.due_day,
    is_default: data.is_default,
    archived: false,
    balance: data.initial_balance,
  }, { status: 201 });
}
