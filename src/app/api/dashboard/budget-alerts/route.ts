import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/current-user';
import { getDb } from '@/lib/db';
import { getCurrentMonth, getVietnamToday } from '@/lib/utils';

function getMonthRange(month: string) {
  const [year, value] = month.split('-').map(Number);
  const next = new Date(year, value, 1);
  return { start: `${month}-01`, end: `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01` };
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const month = request.nextUrl.searchParams.get('month') ?? getCurrentMonth();
  const today = getVietnamToday();
  const { start, end } = getMonthRange(month);
  try {
    const db = await getDb();
    const result = await db.execute({
      sql: `SELECT b.id, b.budget_amount, b.warning_percent, b.budget_basis, b.daily_amount, b.daily_limit,
                   c.name AS category_name, c.color AS category_color,
                   COALESCE(SUM(e.amount), 0) AS spent_amount,
                   COALESCE(SUM(CASE WHEN e.expense_date = ? THEN e.amount ELSE 0 END), 0) AS today_spent
            FROM budget_jars b
            LEFT JOIN categories c ON c.id = b.category_id
            LEFT JOIN expenses e ON e.user_id = b.user_id AND e.category_id = b.category_id
              AND e.type = 'expense' AND e.expense_date >= ? AND e.expense_date < ?
            WHERE b.user_id = ? AND b.month = ?
            GROUP BY b.id, b.budget_amount, b.warning_percent, b.budget_basis, b.daily_amount, b.daily_limit, c.name, c.color
            ORDER BY spent_amount DESC`,
      args: [today, start, end, user.id, month],
    });
    const rows = result.rows
      .map((row) => {
        const effectiveDailyLimit = Number(row.daily_limit) > 0
          ? Number(row.daily_limit)
          : row.budget_basis === 'daily'
            ? Number(row.daily_amount) || 0
            : 0;
        return {
          id: String(row.id),
          budget_amount: Number(row.budget_amount) || 0,
          warning_percent: Number(row.warning_percent) || 101,
          category_name: String(row.category_name || ''),
          category_color: String(row.category_color || ''),
          spent_amount: Number(row.spent_amount) || 0,
          today_spent: Number(row.today_spent) || 0,
          effective_daily_limit: effectiveDailyLimit,
        };
      })
      .filter((row) => (
        (row.budget_amount > 0 && (
          row.warning_percent > 100
            ? row.spent_amount > row.budget_amount
            : row.spent_amount >= (row.budget_amount * row.warning_percent) / 100
        ))
        || (row.effective_daily_limit > 0 && row.today_spent > row.effective_daily_limit)
      ));
    return NextResponse.json(rows, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('[dashboard-budget-alerts]', error);
    return NextResponse.json({ error: 'Failed to fetch budget alerts' }, { status: 500 });
  }
}
