import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/current-user';

type Period = 'daily' | 'monthly' | 'quarterly' | 'yearly';

interface Range { start: string; end: string; comparisonStart?: string; comparisonEnd?: string; comparisonLabel?: string; }

function monthRange(month: string): Range {
  const [year, value] = month.split('-').map(Number);
  const next = new Date(year, value, 1);
  const previous = new Date(year, value - 2, 1);
  return {
    start: `${month}-01`, end: `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`,
    comparisonStart: `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, '0')}-01`,
    comparisonEnd: `${month}-01`, comparisonLabel: 'so với tháng trước',
  };
}

function getRange(period: Period, month: string, year: string): Range {
  if (period === 'daily') return monthRange(month);
  const selectedYear = Number(year);
  if (period === 'yearly') {
    const currentYear = new Date().getFullYear();
    return { start: `${currentYear - 4}-01-01`, end: `${currentYear + 1}-01-01` };
  }
  return {
    start: `${selectedYear}-01-01`, end: `${selectedYear + 1}-01-01`,
    comparisonStart: `${selectedYear - 1}-01-01`, comparisonEnd: `${selectedYear}-01-01`,
    comparisonLabel: 'so với năm trước',
  };
}

function fillMonthDays(rows: { date: string; total: number }[], month: string) {
  const values = new Map(rows.map((row) => [row.date, Number(row.total) || 0]));
  const [year, selectedMonth] = month.split('-').map(Number);
  const days = new Date(year, selectedMonth, 0).getDate();
  return Array.from({ length: days }, (_, index) => {
    const date = `${month}-${String(index + 1).padStart(2, '0')}`;
    return { date, total: values.get(date) ?? 0 };
  });
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const period = (request.nextUrl.searchParams.get('period') || 'daily') as Period;
    const month = request.nextUrl.searchParams.get('month') || new Date().toISOString().slice(0, 7);
    const year = request.nextUrl.searchParams.get('year') || new Date().getFullYear().toString();
    const range = getRange(period, month, year);
    const db = await getDb();
    const baseArgs = [user.id, range.start, range.end];
    const dateQuery = period === 'daily'
      ? `SELECT expense_date AS date, SUM(amount) AS total FROM expenses WHERE user_id = ? AND type = 'expense' AND expense_date >= ? AND expense_date < ? GROUP BY expense_date ORDER BY expense_date`
      : period === 'monthly'
        ? `SELECT strftime('%Y-%m', expense_date) AS date, SUM(amount) AS total FROM expenses WHERE user_id = ? AND type = 'expense' AND expense_date >= ? AND expense_date < ? GROUP BY date ORDER BY date`
        : period === 'quarterly'
          ? `SELECT 'Q' || CAST((CAST(strftime('%m', expense_date) AS INTEGER) + 2) / 3 AS INTEGER) AS date, SUM(amount) AS total FROM expenses WHERE user_id = ? AND type = 'expense' AND expense_date >= ? AND expense_date < ? GROUP BY date ORDER BY date`
          : `SELECT strftime('%Y', expense_date) AS date, SUM(amount) AS total FROM expenses WHERE user_id = ? AND type = 'expense' AND expense_date >= ? AND expense_date < ? GROUP BY date ORDER BY date`;

    const [totalResult, categoryResult, byDateResult, previousResult] = await Promise.all([
      db.execute({ sql: `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count FROM expenses WHERE user_id = ? AND type = 'expense' AND expense_date >= ? AND expense_date < ?`, args: baseArgs }),
      db.execute({ sql: `SELECT c.name AS category_name, c.color AS category_color, SUM(e.amount) AS total, COUNT(*) AS count FROM expenses e JOIN categories c ON c.id = e.category_id WHERE e.user_id = ? AND e.type = 'expense' AND e.expense_date >= ? AND e.expense_date < ? GROUP BY c.id, c.name, c.color ORDER BY total DESC LIMIT 8`, args: baseArgs }),
      db.execute({ sql: dateQuery, args: baseArgs }),
      range.comparisonStart && range.comparisonEnd
        ? db.execute({ sql: `SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE user_id = ? AND type = 'expense' AND expense_date >= ? AND expense_date < ?`, args: [user.id, range.comparisonStart, range.comparisonEnd] })
        : Promise.resolve(null),
    ]);

    const total = Number(totalResult.rows[0]?.total) || 0;
    const rawDates = byDateResult.rows.map((row) => ({ date: String(row.date), total: Number(row.total) || 0 }));
    const byDate = period === 'daily' ? fillMonthDays(rawDates, month) : rawDates;
    const days = period === 'daily' ? new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate() : byDate.length || 1;
    return NextResponse.json({
      total,
      count: Number(totalResult.rows[0]?.count) || 0,
      daily_average: Math.round(total / days),
      by_category: categoryResult.rows,
      by_date: byDate,
      previous_total: Number(previousResult?.rows[0]?.total) || 0,
      comparison_label: range.comparisonLabel || '',
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('[expense-stats]', error);
    return NextResponse.json({ error: 'Failed to get stats' }, { status: 500 });
  }
}
