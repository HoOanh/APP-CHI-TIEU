import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/current-user';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const period = searchParams.get('period') || 'monthly';
    const month = searchParams.get('month'); // YYYY-MM
    const year = searchParams.get('year'); // YYYY

    // Only count expenses (type = 'expense'), not income
    const expenseFilter = "type = 'expense'";

    let baseQuery = `WHERE user_id = ? AND ${expenseFilter}`;
    const params: (string | number)[] = [user.id];
    let byDateQuery = '';
    
    if (period === 'daily' && month) {
      baseQuery = `WHERE user_id = ? AND strftime('%Y-%m', expense_date) = ? AND ${expenseFilter}`;
      params.push(month);
      byDateQuery = `SELECT expense_date as date, SUM(amount) as total FROM expenses ${baseQuery} GROUP BY expense_date ORDER BY expense_date ASC`;
    } else if (period === 'monthly' && year) {
      baseQuery = `WHERE user_id = ? AND strftime('%Y', expense_date) = ? AND ${expenseFilter}`;
      params.push(year);
      byDateQuery = `SELECT strftime('%Y-%m', expense_date) as date, SUM(amount) as total FROM expenses ${baseQuery} GROUP BY strftime('%Y-%m', expense_date) ORDER BY date ASC`;
    } else if (period === 'quarterly' && year) {
      baseQuery = `WHERE user_id = ? AND strftime('%Y', expense_date) = ? AND ${expenseFilter}`;
      params.push(year);
      byDateQuery = `
        SELECT 
          CAST((cast(strftime('%m', expense_date) as integer) + 2) / 3 AS text) as date, 
          SUM(amount) as total 
        FROM expenses ${baseQuery} 
        GROUP BY date ORDER BY date ASC
      `;
    } else if (period === 'yearly') {
      baseQuery = `WHERE user_id = ? AND expense_date >= date('now', '-5 years') AND ${expenseFilter}`;
      byDateQuery = `SELECT strftime('%Y', expense_date) as date, SUM(amount) as total FROM expenses ${baseQuery} GROUP BY strftime('%Y', expense_date) ORDER BY date ASC`;
    }

    const db = await getDb();
    
    const totalResult = await db.execute({
      sql: `SELECT SUM(amount) as total, COUNT(*) as count FROM expenses ${baseQuery}`,
      args: params
    });
    const totalRow = totalResult.rows[0] as unknown as {total: number, count: number};
    
    const byCategoryResult = await db.execute({
      sql: `
        SELECT
          c.id,
          c.name as category_name,
          c.color as category_color,
          c.icon as category_icon,
          SUM(e.amount) as total,
          COUNT(*) as count
        FROM expenses e 
        JOIN categories c ON e.category_id = c.id 
        ${baseQuery.replace(/user_id/g, 'e.user_id').replace(/expense_date/g, 'e.expense_date').replace("type = 'expense'", "e.type = 'expense'")}
        GROUP BY c.id 
        ORDER BY total DESC
      `,
      args: params
    });
    const byCategory = byCategoryResult.rows;

    let byDate: { date: string; total: number }[] = [];
    if (byDateQuery) {
      const byDateResult = await db.execute({
        sql: byDateQuery,
        args: params
      });
      byDate = byDateResult.rows as unknown as { date: string; total: number }[];
    }

    let dailyAverage = 0;
    if (totalRow && totalRow.total > 0 && period === 'daily' && month) {
      const parts = month.split('-');
      const daysInMonth = new Date(parseInt(parts[0]), parseInt(parts[1]), 0).getDate();
      dailyAverage = totalRow.total / daysInMonth;
    }

    return NextResponse.json({
      total: totalRow?.total || 0,
      count: totalRow?.count || 0,
      by_category: byCategory,
      by_date: byDate,
      daily_average: Math.round(dailyAverage)
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to get stats' }, { status: 500 });
  }
}
