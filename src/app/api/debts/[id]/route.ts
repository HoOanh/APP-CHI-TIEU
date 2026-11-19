import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/current-user';

interface RouteContext { params: Promise<{ id: string }> }

const updateDebtSchema = z.object({
  name: z.string().trim().min(1).max(120),
  creditor: z.string().trim().min(1).max(120),
  total_amount: z.coerce.number().finite().positive(),
  interest_rate: z.coerce.number().finite().min(0).max(1000).optional().default(0),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().max(500).optional().default(''),
  status: z.enum(['active', 'completed']).optional(),
}).refine((val) => isValidCalendarDate(val.start_date) && isValidCalendarDate(val.due_date) && val.due_date >= val.start_date, {
  message: 'Ngày bắt đầu hoặc hạn trả không hợp lệ.',
});

function isValidCalendarDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const db = await getDb();
    const query = `
      SELECT d.*, 
      COALESCE((SELECT SUM(amount) FROM debt_payments dp WHERE dp.user_id = d.user_id AND dp.debt_id = d.id), 0) as paid_amount
      FROM debts d WHERE d.id = ? AND d.user_id = ?
    `;
    const debt = await db.execute({ sql: query, args: [id, user.id] });
    
    if (debt.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(debt.rows[0]);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to fetch debt' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const rawBody: unknown = await request.json().catch(() => null);
    const parsed = updateDebtSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Kiểm tra tên, chủ nợ, số tiền và ngày bắt đầu/ngày hạn.' }, { status: 400 });
    }
    const { name, creditor, total_amount, interest_rate, start_date, due_date, note, status } = parsed.data;
    const db = await getDb();
    
    await db.execute({
      sql: `
        UPDATE debts 
        SET name = ?, creditor = ?, total_amount = ?, interest_rate = ?, start_date = ?, due_date = ?, note = ?, status = COALESCE(?, status)
        WHERE id = ? AND user_id = ?
      `,
      args: [name, creditor, total_amount, interest_rate, start_date, due_date, note.trim(), status ?? null, id, user.id]
    });
    
    const updated = await db.execute({ sql: 'SELECT * FROM debts WHERE id = ? AND user_id = ?', args: [id, user.id] });
    if (!updated.rows[0]) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json(updated.rows[0]);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to update debt' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const db = await getDb();
    
    const stmts = [
      { sql: 'DELETE FROM debt_payments WHERE debt_id = ? AND user_id = ?', args: [id, user.id] },
      { sql: 'DELETE FROM debt_jars WHERE debt_id = ? AND user_id = ?', args: [id, user.id] },
      { sql: 'DELETE FROM debts WHERE id = ? AND user_id = ?', args: [id, user.id] }
    ];
    
    await db.batch(stmts, 'write');
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to delete debt' }, { status: 500 });
  }
}
