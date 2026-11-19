import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/current-user';
import { getDb } from '@/lib/db';
import { ensureUserLedgerAndAccount } from '@/lib/ledger-context';
import { getVietnamToday } from '@/lib/utils';

const createDebtSchema = z.object({
  name: z.string().trim().min(1, 'Nhập tên khoản công nợ').max(120),
  creditor: z.string().trim().min(1, 'Nhập đối tác / ngân hàng').max(120),
  direction: z.enum(['payable', 'receivable']).optional().default('payable'),
  account_id: z.coerce.number().int().positive().nullable().optional(),
  total_amount: z.coerce.number().finite().positive('Số tiền phải lớn hơn 0'),
  interest_rate: z.coerce.number().finite().min(0).max(1000).optional().default(0),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().max(500).optional().default(''),
}).refine((val) => {
  const start = val.start_date || getVietnamToday();
  return isValidDate(start) && isValidDate(val.due_date) && val.due_date >= start;
}, {
  message: 'Kiểm tra ngày bắt đầu và hạn thanh toán.',
});

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const direction = request.nextUrl.searchParams.get('direction');
    const db = await getDb();
    const { ledgerId } = await ensureUserLedgerAndAccount(db, user.id);

    const conditions = ['(d.ledger_id = ? OR (d.ledger_id IS NULL AND d.user_id = ?))'];
    const args: Array<string | number> = [ledgerId, user.id];
    if (direction === 'payable' || direction === 'receivable') {
      conditions.push('d.direction = ?');
      args.push(direction);
    }

    const query = `
      SELECT d.*,
             a.name AS account_name,
             COALESCE((SELECT SUM(amount) FROM debt_payments dp WHERE dp.debt_id = d.id), 0) AS paid_amount,
             d.total_amount - COALESCE((SELECT SUM(amount) FROM debt_payments dp WHERE dp.debt_id = d.id), 0) AS remaining_amount
      FROM debts d
      LEFT JOIN accounts a ON a.id = d.account_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY
        CASE WHEN d.status = 'active' THEN 0 ELSE 1 END,
        d.created_at DESC
    `;
    const debts = await db.execute({ sql: query, args });
    return NextResponse.json(debts.rows);
  } catch (error) {
    console.error('[GET /api/debts]', error);
    return NextResponse.json({ error: 'Failed to fetch debts' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rawBody: unknown = await request.json().catch(() => null);
    const parsed = createDebtSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Dữ liệu công nợ không hợp lệ.' },
        { status: 400 },
      );
    }

    const db = await getDb();
    const { ledgerId, defaultAccountId } = await ensureUserLedgerAndAccount(db, user.id);
    const { name, creditor, direction, account_id, total_amount, interest_rate, due_date, note } = parsed.data;
    const startDate = parsed.data.start_date || getVietnamToday();

    let resolvedAccountId = defaultAccountId;
    if (account_id) {
      const accCheck = await db.execute({
        sql: 'SELECT id FROM accounts WHERE id = ? AND ledger_id = ? AND archived = 0 LIMIT 1',
        args: [account_id, ledgerId],
      });
      if (accCheck.rows[0]) resolvedAccountId = Number(accCheck.rows[0].id);
    }

    const info = await db.execute({
      sql: `
        INSERT INTO debts (user_id, ledger_id, account_id, direction, name, creditor, total_amount, interest_rate, start_date, due_date, note)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        user.id,
        ledgerId,
        resolvedAccountId,
        direction,
        name,
        creditor,
        total_amount,
        interest_rate,
        startDate,
        due_date,
        note.trim(),
      ],
    });

    const newDebt = await db.execute({
      sql: 'SELECT * FROM debts WHERE id = ? AND user_id = ?',
      args: [info.lastInsertRowid!, user.id],
    });
    return NextResponse.json(newDebt.rows[0], { status: 201 });
  } catch (error) {
    console.error('[POST /api/debts]', error);
    return NextResponse.json({ error: 'Failed to create debt' }, { status: 500 });
  }
}

function isValidDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
