import { NextRequest, NextResponse } from 'next/server';
import { computeSafeToSpend, evaluateBudgetJar } from '@/lib/budget-evaluator';
import { getCurrentUser } from '@/lib/current-user';
import { getDb } from '@/lib/db';
import { assertLedgerAccess, LedgerAccessError } from '@/lib/ledger-access';
import { getUserLedgerContext } from '@/lib/ledger-context';
import { UNCLASSIFIED_EXPENSE } from '@/lib/schema';
import { getCurrentMonth, getVietnamToday } from '@/lib/utils';

function getMonthRange(month: string) {
  const [year, value] = month.split('-').map(Number);
  const next = new Date(Date.UTC(year, value, 1));
  const prev = new Date(Date.UTC(year, value - 2, 1));
  return {
    start: `${month}-01`,
    end: `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-01`,
    prevStart: `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}-01`,
    prevEnd: `${month}-01`,
  };
}

export async function GET(request: NextRequest) {
  const startedAt = performance.now();
  const user = await getCurrentUser();
  const authenticatedAt = performance.now();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const month = request.nextUrl.searchParams.get('month') ?? getCurrentMonth();
  const { start, end, prevStart, prevEnd } = getMonthRange(month);

  try {
    const db = await getDb();
    const ctx = await getUserLedgerContext(db, user.id);
    await assertLedgerAccess(db, user.id, ctx.ledgerId, 'viewer');
    const databaseReadyAt = performance.now();
    const today = getVietnamToday();

    const [
      summaryResult,
      prevSummaryResult,
      accountsResult,
      recentResult,
      alertsResult,
      categoryResult,
      unplannedResult,
      insightResult,
    ] = await db.batch([
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
        sql: `SELECT
                COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS prev_income,
                COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS prev_expense
              FROM expenses
              WHERE (ledger_id = ? OR (ledger_id IS NULL AND user_id = ?))
                AND expense_date >= ? AND expense_date < ?`,
        args: [ctx.ledgerId, user.id, prevStart, prevEnd],
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
        sql: `SELECT e.id, e.amount, e.description, e.expense_date AS date, e.type, e.created_by_user_id,
                     COALESCE(co.name, c.name, '${UNCLASSIFIED_EXPENSE}') AS category_name,
                     COALESCE(co.icon, c.icon, 'tag') AS category_icon,
                     COALESCE(co.color, c.color, '#64748B') AS category_color,
                     a1.name AS account_name, a2.name AS to_account_name,
                     cu.name AS created_by_name,
                     CASE WHEN e.type = 'expense' AND e.category_id IS NOT NULL AND EXISTS (
                       SELECT 1 FROM budget_jars b
                       WHERE (b.ledger_id = ? OR (b.ledger_id IS NULL AND b.user_id = ?))
                         AND b.category_id = e.category_id
                         AND b.month = strftime('%Y-%m', e.expense_date)
                     ) THEN 1 ELSE 0 END AS in_budget_jar
              FROM expenses e
              LEFT JOIN categories c ON c.id = e.category_id
              LEFT JOIN category_overrides co ON co.category_id = c.id AND co.user_id = ?
              LEFT JOIN accounts a1 ON a1.id = e.account_id
              LEFT JOIN accounts a2 ON a2.id = e.to_account_id
              LEFT JOIN users cu ON cu.id = COALESCE(e.created_by_user_id, e.user_id)
              WHERE e.ledger_id = ? OR (e.ledger_id IS NULL AND e.user_id = ?)
              ORDER BY e.expense_date DESC, e.id DESC LIMIT 6`,
        args: [ctx.ledgerId, user.id, user.id, ctx.ledgerId, user.id],
      },
      {
        sql: `SELECT b.id, b.month, b.budget_amount, b.rollover_amount, b.warning_percent, b.budget_basis, b.daily_amount, b.daily_limit,
                      b.frequency_limit, b.frequency_period,
                      COALESCE(co.name, c.name) AS category_name,
                      COALESCE(co.icon, c.icon, 'tag') AS category_icon,
                      COALESCE(co.color, c.color, '#64748B') AS category_color,
                      COALESCE(SUM(e.amount), 0) AS spent_amount,
                      COALESCE(SUM(CASE WHEN e.expense_date = ? THEN e.amount ELSE 0 END), 0) AS today_spent,
                      COUNT(CASE WHEN e.expense_date = ? THEN 1 END) AS today_count,
                      COUNT(*) AS month_count
              FROM budget_jars b
              LEFT JOIN categories c ON c.id = b.category_id
              LEFT JOIN category_overrides co ON co.category_id = c.id AND co.user_id = ?
              LEFT JOIN expenses e ON (e.ledger_id = b.ledger_id OR (b.ledger_id IS NULL AND e.user_id = b.user_id))
                AND e.category_id = b.category_id
                AND e.type = 'expense' AND e.expense_date >= ? AND e.expense_date < ?
              WHERE (b.ledger_id = ? OR (b.ledger_id IS NULL AND b.user_id = ?)) AND b.month = ?
              GROUP BY b.id, b.month, b.budget_amount, b.rollover_amount, b.warning_percent, b.budget_basis, b.daily_amount, b.daily_limit, b.frequency_limit, b.frequency_period, COALESCE(co.name, c.name), COALESCE(co.icon, c.icon, 'tag'), COALESCE(co.color, c.color, '#64748B')
              ORDER BY spent_amount DESC`,
        args: [today, today, user.id, start, end, ctx.ledgerId, user.id, month],
      },
      {
        sql: `SELECT COALESCE(c.id, 0) AS id,
                     COALESCE(co.name, c.name, '${UNCLASSIFIED_EXPENSE}') AS name,
                     COALESCE(co.icon, c.icon, 'tag') AS icon,
                     COALESCE(co.color, c.color, '#64748B') AS color,
                     COALESCE(SUM(e.amount), 0) AS spent_amount
              FROM expenses e
              LEFT JOIN categories c ON c.id = e.category_id
              LEFT JOIN category_overrides co ON co.category_id = c.id AND co.user_id = ?
              WHERE (e.ledger_id = ? OR (e.ledger_id IS NULL AND e.user_id = ?))
                AND e.type = 'expense'
                AND e.expense_date >= ? AND e.expense_date < ?
              GROUP BY COALESCE(c.id, 0), COALESCE(co.name, c.name, '${UNCLASSIFIED_EXPENSE}'), COALESCE(co.icon, c.icon, 'tag'), COALESCE(co.color, c.color, '#64748B')
              ORDER BY spent_amount DESC
              LIMIT 6`,
        args: [user.id, ctx.ledgerId, user.id, start, end],
      },
      {
        sql: `SELECT COALESCE(SUM(e.amount), 0) AS unplanned_expense,
                     COUNT(*) AS unplanned_count
              FROM expenses e
              WHERE (e.ledger_id = ? OR (e.ledger_id IS NULL AND e.user_id = ?))
                AND e.type = 'expense'
                AND e.expense_date >= ? AND e.expense_date < ?
                AND (
                  e.category_id IS NULL
                  OR NOT EXISTS (
                    SELECT 1 FROM budget_jars b
                    WHERE (b.ledger_id = ? OR (b.ledger_id IS NULL AND b.user_id = ?))
                      AND b.category_id = e.category_id
                      AND b.month = ?
                  )
                )`,
        args: [ctx.ledgerId, user.id, start, end, ctx.ledgerId, user.id, month],
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
    const prevRow = prevSummaryResult.rows[0];
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
    const income = Number(row?.income) || 0;
    const expense = Number(row?.expense) || 0;
    const prevIncome = Number(prevRow?.prev_income) || 0;
    const prevExpense = Number(prevRow?.prev_expense) || 0;
    const days = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
    const isCurrentMonth = month === today.slice(0, 7);
    const elapsedDays = isCurrentMonth ? Math.max(1, Number(today.slice(8, 10)) || 1) : days;

    const evaluatedBudgets = alertsResult.rows.map((budget) => {
      const jarInput = {
        id: String(budget.id),
        category_name: String(budget.category_name || UNCLASSIFIED_EXPENSE),
        month: String(budget.month || month),
        budget_amount: Number(budget.budget_amount) || 0,
        rollover_amount: Number(budget.rollover_amount) || 0,
        budget_basis: String(budget.budget_basis || 'monthly'),
        daily_amount: Number(budget.daily_amount) || 0,
        daily_limit: Number(budget.daily_limit) || 0,
        warning_percent: Number(budget.warning_percent) || 101,
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

    const dailyJars = evaluatedBudgets.filter((item) => item.jarInput.budget_basis === 'daily');
    const monthlyJars = evaluatedBudgets.filter((item) => item.jarInput.budget_basis !== 'daily');

    const dailyJarSpent = dailyJars.reduce((sum, item) => sum + item.jarInput.spent_amount, 0);
    const dailyJarBudget = dailyJars.reduce((sum, item) => sum + item.evaluated.effectiveBudget, 0);
    const dailyTargetAverage = dailyJars.reduce(
      (sum, item) => sum + (item.jarInput.daily_amount > 0 ? item.jarInput.daily_amount : item.jarInput.daily_limit || 0),
      0,
    );
    const monthlyJarSpent = monthlyJars.reduce((sum, item) => sum + item.jarInput.spent_amount, 0);
    const monthlyJarBudget = monthlyJars.reduce((sum, item) => sum + item.evaluated.effectiveBudget, 0);

    const unplannedRow = unplannedResult.rows[0];
    const unplannedExpense = Number(unplannedRow?.unplanned_expense) || 0;
    const unplannedCount = Number(unplannedRow?.unplanned_count) || 0;

    // TB chi ngày ONLY calculates across daily-basis jars (`budget_basis === 'daily'`) over elapsed days!
    const dailyAverage = dailyJars.length > 0 ? Math.round(dailyJarSpent / elapsedDays) : 0;

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
          warning_percent: item.jarInput.warning_percent,
          category_name: item.jarInput.category_name,
          category_color: String(item.raw.category_color || '#64748B'),
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

    const dangerCount = evaluatedBudgets.filter((b) => b.evaluated.highestAlert?.severity === 'danger').length;
    const warningCount = evaluatedBudgets.filter((b) => b.evaluated.highestAlert?.severity === 'warning').length;
    const safeCount = Math.max(0, evaluatedBudgets.length - dangerCount - warningCount);

    const budgetHealth = {
      totalCount: evaluatedBudgets.length,
      dailyCount: dailyJars.length,
      monthlyCount: monthlyJars.length,
      safeCount,
      warningCount,
      dangerCount,
      totalBudget: Math.round(dailyJarBudget + monthlyJarBudget),
      totalSpent: Math.round(dailyJarSpent + monthlyJarSpent),
      jars: [...evaluatedBudgets]
        .sort((a, b) => {
          const rank = (x: typeof a) => (x.evaluated.highestAlert?.severity === 'danger' ? 0 : x.evaluated.highestAlert?.severity === 'warning' ? 1 : 2);
          const diff = rank(a) - rank(b);
          return diff !== 0 ? diff : b.evaluated.percentage - a.evaluated.percentage;
        })
        .slice(0, 5)
        .map((item) => ({
          id: String(item.raw.id),
          category_name: item.jarInput.category_name,
          category_color: String(item.raw.category_color || '#64748B'),
          budget_basis: item.jarInput.budget_basis === 'daily' ? 'daily' : 'monthly',
          budget_amount: item.evaluated.effectiveBudget,
          spent_amount: item.jarInput.spent_amount,
          daily_amount: item.jarInput.daily_amount || 0,
          today_spent: item.jarInput.today_spent || 0,
          percentage: Math.round(item.evaluated.percentage),
          severity: item.evaluated.highestAlert?.severity ?? 'safe',
        })),
    };

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
        income,
        expense,
        prevIncome,
        prevExpense,
        dailyAverage,
        dailyTargetAverage: Math.round(dailyTargetAverage),
        dailyJarsCount: dailyJars.length,
        dailyJarSpent: Math.round(dailyJarSpent),
        dailyJarBudget: Math.round(dailyJarBudget),
        monthlyJarsCount: monthlyJars.length,
        monthlyJarSpent: Math.round(monthlyJarSpent),
        monthlyJarBudget: Math.round(monthlyJarBudget),
        unplannedExpense: Math.round(unplannedExpense),
        unplannedCount,
        elapsedDays,
        transactionCount: Number(row?.transaction_count) || 0,
      },
      safeToSpend,
      budgetHealth,
      ledger: {
        id: ctx.ledgerId,
        name: ctx.activeLedgerName,
        kind: ctx.activeLedgerKind,
        role: ctx.activeLedgerRole,
        isShared: ctx.activeLedgerKind !== 'personal',
      },
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
    if (error instanceof LedgerAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[dashboard]', error);
    return NextResponse.json({ error: 'Failed to fetch dashboard' }, { status: 500 });
  }
}
