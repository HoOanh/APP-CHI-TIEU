import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/current-user';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { from_month, to_month } = await request.json();
    if (!from_month || !to_month) return NextResponse.json({ error: 'from_month and to_month required' }, { status: 400 });

    const db = await getDb();
    const previousBudgets = await db.execute({
      sql: 'SELECT * FROM budget_jars WHERE user_id = ? AND month = ?',
      args: [user.id, from_month],
    });
    const targetDays = getDaysInMonth(String(to_month));
    
    const insertSql = `
      INSERT INTO budget_jars (user_id, category_id, month, budget_amount, budget_basis, daily_amount, budget_days, warning_percent, daily_limit, frequency_limit, frequency_period)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, category_id, month) DO UPDATE SET 
        budget_amount = excluded.budget_amount,
        budget_basis = excluded.budget_basis,
        daily_amount = excluded.daily_amount,
        budget_days = excluded.budget_days,
        warning_percent = excluded.warning_percent,
        daily_limit = excluded.daily_limit,
        frequency_limit = excluded.frequency_limit,
        frequency_period = excluded.frequency_period
    `;

    const stmts = previousBudgets.rows.map((b) => {
      const basis = b.budget_basis === 'daily' ? 'daily' : 'monthly';
      const days = basis === 'daily' ? targetDays : 0;
      const dailyAmount = basis === 'daily' ? Number(b.daily_amount) || 0 : 0;
      return {
        sql: insertSql,
        args: [user.id, b.category_id, to_month, basis === 'daily' ? dailyAmount * days : b.budget_amount, basis, dailyAmount, days, b.warning_percent, b.daily_limit || 0, b.frequency_limit || 0, b.frequency_period || '']
      };
    });

    if (stmts.length > 0) {
      await db.batch(stmts, 'write');
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to copy budgets' }, { status: 500 });
  }
}

function getDaysInMonth(month: string) {
  const match = month.match(/^(\d{4})-(\d{2})$/);
  return match ? new Date(Number(match[1]), Number(match[2]), 0).getDate() : 0;
}
