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
    
    const insertSql = `
      INSERT INTO budget_jars (user_id, category_id, month, budget_amount, warning_percent, daily_limit, frequency_limit, frequency_period) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, category_id, month) DO UPDATE SET 
        budget_amount = excluded.budget_amount,
        warning_percent = excluded.warning_percent,
        daily_limit = excluded.daily_limit,
        frequency_limit = excluded.frequency_limit,
        frequency_period = excluded.frequency_period
    `;

    const stmts = previousBudgets.rows.map((b) => ({
      sql: insertSql,
      args: [user.id, b.category_id, to_month, b.budget_amount, b.warning_percent, b.daily_limit || 0, b.frequency_limit || 0, b.frequency_period || '']
    }));

    if (stmts.length > 0) {
      await db.batch(stmts, 'write');
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to copy budgets' }, { status: 500 });
  }
}
