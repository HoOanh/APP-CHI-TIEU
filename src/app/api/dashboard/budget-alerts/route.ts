import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/current-user';
import { getDb } from '@/lib/db';

function getMonthRange(month: string) {
  const [year, value] = month.split('-').map(Number);
  const next = new Date(year, value, 1);
  return { start: `${month}-01`, end: `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01` };
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const month = request.nextUrl.searchParams.get('month') ?? new Date().toISOString().slice(0, 7);
  const { start, end } = getMonthRange(month);
  try {
    const db = await getDb();
    const result = await db.execute({
      sql: `SELECT b.id, b.budget_amount, b.warning_percent, c.name AS category_name, c.color AS category_color,
                    COALESCE(SUM(e.amount), 0) AS spent_amount
            FROM budget_jars b
            LEFT JOIN categories c ON c.id = b.category_id
            LEFT JOIN expenses e ON e.user_id = b.user_id AND e.category_id = b.category_id
              AND e.type = 'expense' AND e.expense_date >= ? AND e.expense_date < ?
            WHERE b.user_id = ? AND b.month = ?
            GROUP BY b.id, b.budget_amount, b.warning_percent, c.name, c.color
            HAVING COALESCE(SUM(e.amount), 0) >= b.budget_amount * b.warning_percent / 100
            ORDER BY spent_amount DESC LIMIT 2`,
      args: [start, end, user.id, month],
    });
    return NextResponse.json(result.rows, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('[dashboard-budget-alerts]', error);
    return NextResponse.json({ error: 'Failed to fetch budget alerts' }, { status: 500 });
  }
}
