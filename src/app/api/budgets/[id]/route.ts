import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/current-user';

interface RouteContext { params: Promise<{ id: string }> }

const VALID_FREQUENCY_PERIODS = new Set(['', 'day', 'week', 'month']);

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const body: unknown = await request.json().catch(() => null);
    if (!isRecord(body)) return NextResponse.json({ error: 'Dữ liệu ngân sách không hợp lệ.' }, { status: 400 });
    const categoryId = Number(body.category_id);
    const month = typeof body.month === 'string' ? body.month : '';
    const basis = body.budget_basis === 'daily' ? 'daily' : 'monthly';
    const dailyAmount = Number(body.daily_amount) || 0;
    const days = Number(body.budget_days) || 0;
    const amount = basis === 'daily' ? dailyAmount * days : Number(body.budget_amount);
    const warningPercent = Math.min(100, Math.max(1, Number(body.warning_percent) || 80));
    const dailyLimit = Math.max(0, Number(body.daily_limit) || 0);
    const frequencyLimit = Math.max(0, Math.trunc(Number(body.frequency_limit) || 0));
    const frequencyPeriod = typeof body.frequency_period === 'string' && VALID_FREQUENCY_PERIODS.has(body.frequency_period)
      ? body.frequency_period
      : '';

    if (!Number.isInteger(categoryId) || categoryId <= 0 || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !Number.isFinite(amount) || amount <= 0 || (basis === 'daily' && (!Number.isInteger(days) || days < 1 || days > getDaysInMonth(month) || dailyAmount <= 0))) {
      return NextResponse.json({ error: 'Kiểm tra danh mục, tháng, số tiền và số ngày.' }, { status: 400 });
    }
    const db = await getDb();
    const category = await db.execute({ sql: "SELECT id FROM categories WHERE id = ? AND (user_id IS NULL OR user_id = ?) AND kind <> 'income'", args: [categoryId, user.id] });
    if (!category.rows[0]) return NextResponse.json({ error: 'Danh mục chi tiêu không hợp lệ.' }, { status: 400 });
    await db.execute({
      sql: `UPDATE budget_jars
            SET category_id = ?, month = ?, budget_amount = ?, budget_basis = ?, daily_amount = ?,
                budget_days = ?, warning_percent = ?, daily_limit = ?, frequency_limit = ?, frequency_period = ?
            WHERE id = ? AND user_id = ?`,
      args: [categoryId, month, amount, basis, basis === 'daily' ? dailyAmount : 0, basis === 'daily' ? days : 0, warningPercent, dailyLimit, frequencyLimit, frequencyPeriod, id, user.id],
    });
    
    const updated = await db.execute({ sql: 'SELECT * FROM budget_jars WHERE id = ? AND user_id = ?', args: [id, user.id] });
    if (!updated.rows[0]) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json(updated.rows[0]);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to update budget' }, { status: 500 });
  }
}

function getDaysInMonth(month: string) {
  const match = month.match(/^(\d{4})-(\d{2})$/);
  return match ? new Date(Number(match[1]), Number(match[2]), 0).getDate() : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const db = await getDb();
    const deleted = await db.execute({ sql: 'DELETE FROM budget_jars WHERE id = ? AND user_id = ?', args: [id, user.id] });
    if (Number(deleted.rowsAffected) === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to delete budget' }, { status: 500 });
  }
}
