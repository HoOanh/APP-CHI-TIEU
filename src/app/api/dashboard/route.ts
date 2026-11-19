import { NextRequest, NextResponse } from 'next/server';
import { computeSafeToSpend, evaluateBudgetJar } from '@/lib/budget-evaluator';
import { getCurrentUser } from '@/lib/current-user';
import { getDb } from '@/lib/db';
import { getUserLedgerContext } from '@/lib/ledger-context';
import { getCurrentMonth, getVietnamToday } from '@/lib/utils';

function getMonthRange(month: string) {
  const [year, value] = month.split('-').map(Number);
  const next = new Date(Date.UTC(year, value, 1));
  return {
    start: `${month}-01`,
    end: `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-01`,
  };
}

export async function GET(request: NextRequest) {
  const startedAt = performance.now();
  const user = await getCurrentUser();
  const authenticatedAt = performance.now();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const month = request.nextUrl.searchParams.get('month') ?? getCurrentMonth();
  const { start, end } = getMonthRange(month);

  try {
    const db = await getDb();
    const ctx = await getUserLedgerContext(db, user.id);
    const databaseReadyAt = performance.now();
    const today = getVietnamToday();
    const [summaryResult, accountsResult, recentResult, alertsResult, categoryResult, insightResult] = await db.batch([
      {
        sql: `SELECT
                COALESCE(SUM(CASE WHEN type = 'income' THEN amount WHEN type = 'expense' THEN -amount ELSE 0 END), 0) AS tx_net,
                COALESCE(SUM(CASE WHEN expense_date >= ? AND expense_date < ? AND type = 'income' THEN amount ELSE 0 END), 0) AS income,
                COALESCE(SUM(CASE WHEN expense_date >= ? AND expense_date < ? AND type = 'expense' THEN amount ELSE 0 END), 0) AS expense,
                COUNT(CASE WHEN expense_date >= ? AND expense_date < ? AND type IN ('income', 'expense') THEN 1 END) AS transaction_count
              FROM expenses
              WHERE ledger_id = ? OR (ledger_id IS NULL AND user_id = ?)`,
        args: [start, end, start, end, start, end, ctx.ledgerId, user.id],
      },
      {
        sql: `SELECT a.id, a.name, a.type, a.initial_balance, a.is_default,
                     (
                       a.initial_balance
                       + COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.ledger_id = a.ledger_id AND e.account_id = a.id AND e.type = 'income'), 0)
                       - COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.ledger_id = a.ledger_id AND e.account_id = a.id AND e.type = 'expense'), 0)
                       + COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.ledger_id = a.ledger_id AND e.to_account_id = a.id AND e.type = 'transfer'), 0)
                       - COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.ledger_id = a.ledger_id AND e.account_id = a.id AND e.type = 'transfer'), 0)
                     ) AS balance
              FROM accounts a
              WHERE a.ledger_id = ? AND a.archived = 0
              ORDER BY a.is_default DESC, a.id ASC`,
        args: [ctx.ledgerId],
      },
      {
        sql: `SELECT e.id, e.amount, e.description, e.expense_date AS date, e.type,
                     c.name AS category_name, c.color AS category_color,
                     a1.name AS account_name, a2.name AS to_account_name
              FROM expenses e
              LEFT JOIN categories c ON c.id = e.category_id
              LEFT JOIN accounts a1 ON a1.id = e.account_id
              LEFT JOIN accounts a2 ON a2.id = e.to_account_id
              WHERE e.ledger_id = ? OR (e.ledger_id IS NULL AND e.user_id = ?)
              ORDER BY e.expense_date DESC, e.id DESC LIMIT 5`,
        args: [ctx.ledgerId, user.id],
      },
      {
        sql: `SELECT b.id, b.month, b.budget_amount, b.rollover_amount, b.warning_percent, b.budget_basis, b.daily_amount, b.daily_limit,
                      b.frequency_limit, b.frequency_period,
                      c.name AS category_name, c.color AS category_color,
                      COALESCE(SUM(e.amount), 0) AS spent_amount,
                      COALESCE(SUM(CASE WHEN e.expense_date = ? THEN e.amount ELSE 0 END), 0) AS today_spent,
                      COUNT(CASE WHEN e.expense_date = ? THEN 1 END) AS today_count,
                      COUNT(*) AS month_count
              FROM budget_jars b
              LEFT JOIN categories c ON c.id = b.category_id
              LEFT JOIN expenses e ON e.user_id = b.user_id AND e.category_id = b.category_id
                AND e.type = 'expense' AND e.expense_date >= ? AND e.expense_date < ?
              WHERE b.user_id = ? AND b.month = ?
              GROUP BY b.id, b.month, b.budget_amount, b.rollover_amount, b.warning_percent, b.budget_basis, b.daily_amount, b.daily_limit, b.frequency_limit, b.frequency_period, c.name, c.color
              ORDER BY spent_amount DESC`,
        args: [today, today, start, end, user.id, month],
      },
      {
        sql: `SELECT c.id, c.name, c.color, COALESCE(SUM(e.amount), 0) AS spent_amount
              FROM expenses e
              INNER JOIN categories c ON c.id = e.category_id
              WHERE (e.ledger_id = ? OR (e.ledger_id IS NULL AND e.user_id = ?))
                AND e.type = 'expense'
                AND e.expense_date >= ? AND e.expense_date < ?
              GROUP BY c.id, c.name, c.color
              ORDER BY spent_amount DESC
              LIMIT 4`,
        args: [ctx.ledgerId, user.id, start, end],
      },
      {
        sql: `SELECT id, period_start, period_end, content, created_at FROM ai_insights
              WHERE user_id = ? AND period = 'week'
              ORDER BY period_end DESC, created_at DESC LIMIT 1`,
        args: [user.id],
      },
    ]);

    const queriedAt = performance.now();
    const row = summaryResult.rows[0];
    const accounts = accountsResult.rows.map((acc) => ({
      id: Number(acc.id),
      name: String(acc.name),
      type: String(acc.type),
      initial_balance: Number(acc.initial_balance) || 0,
      is_default: Number(acc.is_default) === 1,
      balance: Number(acc.balance) || 0,
    }));
    const initialSum = accounts.reduce((sum, acc) => sum + acc.initial_balance, 0);
    const walletBalance = initialSum + (Number(row?.tx_net) || 0);
    const expense = Number(row?.expense) || 0;
    const days = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();

    const evaluatedBudgets = alertsResult.rows.map((budget) => {
      const jarInput = {
        id: String(budget.id),
        category_name: String(budget.category_name),
        month: String(budget.month || month),
        budget_amount: Number(budget.budget_amount) || 0,
        rollover_amount: Number(budget.rollover_amount) || 0,
        budget_basis: String(budget.budget_basis || 'monthly'),
        daily_amount: Number(budget.daily_amount) || 0,
        daily_limit: Number(budget.daily_limit) || 0,
        warning_percent: Number(budget.warning_percent) || 80,
        frequency_limit: Number(budget.frequency_limit) || 0,
        frequency_period: String(budget.frequency_period || ''),
        spent_amount: Number(budget.spent_amount) || 0,
        today_spent: Number(budget.today_spent) || 0,
        today_count: Number(budget.today_count) || 0,
        month_count: Number(budget.month_count) || 0,
      };
      return {
        raw: budget,
        jarInput,
        evaluated: evaluateBudgetJar(jarInput, today),
      };
    });

    const safeToSpend = computeSafeToSpend(
      evaluatedBudgets.map((item) => item.jarInput),
      month,
      today,
    );

    const attentionBudgets = evaluatedBudgets
      .flatMap((item) => {
        const alert = item.evaluated.highestAlert;
        if (!alert) return [];
        return [{
          id: String(item.raw.id),
          budget_amount: item.evaluated.effectiveBudget,
          warning_percent: Number(item.raw.warning_percent) || 80,
          category_name: String(item.raw.category_name),
          category_color: String(item.raw.category_color),
          spent_amount: item.jarInput.spent_amount,
          today_spent: item.jarInput.today_spent,
          daily_limit: item.evaluated.effectiveDailyLimit,
          alert_type: (alert.type === 'daily_limit' ? 'daily' : 'monthly') as 'monthly' | 'daily',
          alert_severity: alert.severity,
          alert_message: alert.message,
        }];
      })
      .sort((left, right) => (left.alert_severity === right.alert_severity ? Number(right.spent_amount) - Number(left.spent_amount) : left.alert_severity === 'danger' ? -1 : 1))
      .slice(0, 6);

    const insightRow = insightResult.rows[0];
    const latestInsight = insightRow
      ? {
          id: Number(insightRow.id),
          period_start: String(insightRow.period_start),
          period_end: String(insightRow.period_end),
          content: String(insightRow.content),
          created_at: String(insightRow.created_at),
        }
      : null;

    return NextResponse.json({
      summary: {
        walletBalance,
        income: Number(row?.income) || 0,
        expense,
        dailyAverage: Math.round(expense / days),
        transactionCount: Number(row?.transaction_count) || 0,
      },
      safeToSpend,
      accounts,
      modules: ctx.modules,
      recent: recentResult.rows,
      attentionBudgets,
      categorySpending: categoryResult.rows,
      latestInsight,
    }, {
      headers: {
        'Cache-Control': 'private, no-store',
        'Server-Timing': [
          `auth;dur=${(authenticatedAt - startedAt).toFixed(1)}`,
          `db_ready;dur=${(databaseReadyAt - authenticatedAt).toFixed(1)}`,
          `query;dur=${(queriedAt - databaseReadyAt).toFixed(1)}`,
        ].join(', '),
      },
    });
  } catch (error) {
    console.error('[dashboard]', error);
    return NextResponse.json({ error: 'Failed to fetch dashboard' }, { status: 500 });
  }
}
