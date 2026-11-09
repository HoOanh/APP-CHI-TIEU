import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/current-user';
import { getDb } from '@/lib/db';
import { getCurrentMonth, getVietnamToday } from '@/lib/utils';

function getMonthRange(month: string) {
  const [year, value] = month.split('-').map(Number);
  const next = new Date(year, value, 1);
  return {
    start: `${month}-01`,
    end: `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`,
  };
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const month = request.nextUrl.searchParams.get('month') ?? getCurrentMonth();
  const { start, end } = getMonthRange(month);

  try {
    const db = await getDb();
    const [summaryResult, recentResult, alertsResult, categoryResult] = await db.batch([
      {
        sql: `SELECT
                COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END), 0) AS wallet_balance,
                COALESCE(SUM(CASE WHEN expense_date >= ? AND expense_date < ? AND type = 'income' THEN amount ELSE 0 END), 0) AS income,
                COALESCE(SUM(CASE WHEN expense_date >= ? AND expense_date < ? AND type = 'expense' THEN amount ELSE 0 END), 0) AS expense,
                COUNT(CASE WHEN expense_date >= ? AND expense_date < ? THEN 1 END) AS transaction_count
              FROM expenses WHERE user_id = ?`,
        args: [start, end, start, end, start, end, user.id],
      },
      {
        sql: `SELECT e.id, e.amount, e.description, e.expense_date AS date, e.type,
                      c.name AS category_name, c.color AS category_color
              FROM expenses e LEFT JOIN categories c ON c.id = e.category_id
              WHERE e.user_id = ? ORDER BY e.expense_date DESC, e.created_at DESC LIMIT 5`,
        args: [user.id],
      },
      {
        sql: `SELECT b.id, b.budget_amount, b.warning_percent, c.name AS category_name, c.color AS category_color,
                      COALESCE(SUM(e.amount), 0) AS spent_amount
              FROM budget_jars b
              LEFT JOIN categories c ON c.id = b.category_id
              LEFT JOIN expenses e ON e.user_id = b.user_id AND e.category_id = b.category_id
                AND e.type = 'expense' AND e.expense_date >= ? AND e.expense_date < ?
              WHERE b.user_id = ? AND b.month = ?
              GROUP BY b.id, b.budget_amount, b.warning_percent, c.name, c.color
              ORDER BY spent_amount DESC`,
        args: [start, end, user.id, month],
      },
      {
        sql: `SELECT c.id, c.name, c.color, COALESCE(SUM(e.amount), 0) AS spent_amount
              FROM expenses e
              INNER JOIN categories c ON c.id = e.category_id
              WHERE e.user_id = ? AND e.type = 'expense'
                AND e.expense_date >= ? AND e.expense_date < ?
              GROUP BY c.id, c.name, c.color
              ORDER BY spent_amount DESC
              LIMIT 4`,
        args: [user.id, start, end],
      },
    ]);

    const row = summaryResult.rows[0];
    const expense = Number(row?.expense) || 0;
    const days = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
    const today = getVietnamToday();
    const isCurrentMonth = month === today.slice(0, 7);
    const daysLeft = isCurrentMonth ? Math.max(1, days - Number(today.slice(8, 10)) + 1) : 0;
    const attentionBudgets = alertsResult.rows.reduce<Array<{
      id: string;
      budget_amount: number;
      warning_percent: number;
      category_name: string;
      category_color: string;
      spent_amount: number;
      alert_severity: 'warning' | 'danger';
      alert_message: string;
    }>>((items, budget) => {
        const budgetAmount = Number(budget.budget_amount) || 0;
        const spentAmount = Number(budget.spent_amount) || 0;
        const warningPercent = Number(budget.warning_percent) || 80;
        const percentage = budgetAmount > 0 ? (spentAmount / budgetAmount) * 100 : 0;
        if (percentage < warningPercent) return items;

        const isOver = percentage >= 100;
        const remaining = budgetAmount - spentAmount;
        items.push({
          id: String(budget.id),
          budget_amount: budgetAmount,
          warning_percent: warningPercent,
          category_name: String(budget.category_name),
          category_color: String(budget.category_color),
          spent_amount: spentAmount,
          alert_severity: isOver ? 'danger' : 'warning',
          alert_message: isOver
            ? `Vượt ${formatMoney(Math.abs(remaining))}. Cần điều chỉnh hũ này.`
            : daysLeft
              ? `Còn ${formatMoney(remaining)} · nên chi tối đa ${formatMoney(remaining / daysLeft)}/ngày.`
              : `Còn ${formatMoney(remaining)} trước khi chạm trần.`,
        });
        return items;
      }, [])
      .sort((left, right) => (left.alert_severity === right.alert_severity ? Number(right.spent_amount) - Number(left.spent_amount) : left.alert_severity === 'danger' ? -1 : 1))
      .slice(0, 2);

    return NextResponse.json({
      summary: {
        walletBalance: Number(row?.wallet_balance) || 0,
        income: Number(row?.income) || 0,
        expense,
        dailyAverage: Math.round(expense / days),
        transactionCount: Number(row?.transaction_count) || 0,
      },
      recent: recentResult.rows,
      attentionBudgets,
      categorySpending: categoryResult.rows,
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('[dashboard]', error);
    return NextResponse.json({ error: 'Failed to fetch dashboard' }, { status: 500 });
  }
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(value) + 'đ';
}
