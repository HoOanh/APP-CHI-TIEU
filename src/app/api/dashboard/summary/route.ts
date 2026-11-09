import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/current-user';
import { getDb } from '@/lib/db';
import { getCurrentMonth } from '@/lib/utils';

function getMonthRange(month: string) {
  const [year, value] = month.split('-').map(Number);
  const next = new Date(year, value, 1);
  return { start: `${month}-01`, end: `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01` };
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const month = request.nextUrl.searchParams.get('month') ?? getCurrentMonth();
  const { start, end } = getMonthRange(month);

  try {
    const db = await getDb();
    const result = await db.execute({
      sql: `SELECT
              COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END), 0) AS wallet_balance,
              COALESCE(SUM(CASE WHEN expense_date >= ? AND expense_date < ? AND type = 'income' THEN amount ELSE 0 END), 0) AS income,
              COALESCE(SUM(CASE WHEN expense_date >= ? AND expense_date < ? AND type = 'expense' THEN amount ELSE 0 END), 0) AS expense,
              COUNT(CASE WHEN expense_date >= ? AND expense_date < ? THEN 1 END) AS transaction_count
            FROM expenses WHERE user_id = ?`,
      args: [start, end, start, end, start, end, user.id],
    });
    const row = result.rows[0];
    const expense = Number(row?.expense) || 0;
    const days = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
    return NextResponse.json({
      walletBalance: Number(row?.wallet_balance) || 0,
      income: Number(row?.income) || 0,
      expense,
      dailyAverage: Math.round(expense / days),
      transactionCount: Number(row?.transaction_count) || 0,
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('[dashboard-summary]', error);
    return NextResponse.json({ error: 'Failed to fetch summary' }, { status: 500 });
  }
}
