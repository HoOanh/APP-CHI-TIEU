import { NextRequest, NextResponse } from 'next/server';
import { evaluateBudgetJar } from '@/lib/budget-evaluator';
import { getCurrentUser } from '@/lib/current-user';
import { getDb } from '@/lib/db';
import { assertLedgerAccess, LedgerAccessError } from '@/lib/ledger-access';
import { ensureUserLedgerAndAccount } from '@/lib/ledger-context';
import { getVietnamToday } from '@/lib/utils';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const month = request.nextUrl.searchParams.get('month');
    if (!month) return NextResponse.json({ error: 'Month is required' }, { status: 400 });

    const db = await getDb();
    const { ledgerId } = await ensureUserLedgerAndAccount(db, user.id);
    await assertLedgerAccess(db, user.id, ledgerId, 'viewer');

    const today = getVietnamToday();
    const [todayYear, todayMonth, todayDay] = today.split('-').map(Number);
    const todayDate = new Date(Date.UTC(todayYear, todayMonth - 1, todayDay));
    const dayOfWeek = todayDate.getUTCDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const weekStart = new Date(todayDate);
    weekStart.setUTCDate(todayDate.getUTCDate() + mondayOffset);
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
    const weekStartStr = weekStart.toISOString().slice(0, 10);
    const weekEndStr = weekEnd.toISOString().slice(0, 10);

    const result = await db.execute({
      sql: `SELECT b.*, c.name AS category_name, c.icon AS category_icon,
              c.color AS category_color,
              COALESCE(SUM(CASE
                WHEN e.type = 'expense' AND strftime('%Y-%m', e.expense_date) = b.month
                THEN e.amount ELSE 0 END), 0) AS spent_amount,
              COALESCE(SUM(CASE
                WHEN e.type = 'expense' AND e.expense_date = ?
                THEN e.amount ELSE 0 END), 0) AS today_spent,
              COUNT(CASE
                WHEN e.type = 'expense' AND e.expense_date = ? THEN 1 END
              ) AS today_count,
              COUNT(CASE
                WHEN e.type = 'expense' AND e.expense_date >= ? AND e.expense_date <= ?
                THEN 1 END
              ) AS week_count,
              COUNT(CASE
                WHEN e.type = 'expense' AND strftime('%Y-%m', e.expense_date) = b.month
                THEN 1 END
              ) AS month_count
            FROM budget_jars b
            LEFT JOIN categories c ON c.id = b.category_id
            LEFT JOIN expenses e ON (e.ledger_id = b.ledger_id OR (b.ledger_id IS NULL AND e.user_id = b.user_id))
              AND e.category_id = b.category_id
            WHERE (b.ledger_id = ? OR (b.ledger_id IS NULL AND b.user_id = ?)) AND b.month = ?
            GROUP BY b.id, c.name, c.icon, c.color
            ORDER BY c.name`,
      args: [today, today, weekStartStr, weekEndStr, ledgerId, user.id, month],
    });

    const enriched = result.rows.map((budget) => {
      const todaySpent = Number(budget.today_spent) || 0;
      const todayCount = Number(budget.today_count) || 0;
      const weekCount = Number(budget.week_count) || 0;
      const monthCount = Number(budget.month_count) || 0;

      const evaluated = evaluateBudgetJar(
        {
          id: String(budget.id),
          category_name: String(budget.category_name || ''),
          month: String(budget.month),
          budget_amount: Number(budget.budget_amount) || 0,
          rollover_amount: Number(budget.rollover_amount) || 0,
          budget_basis: String(budget.budget_basis || 'monthly'),
          daily_amount: Number(budget.daily_amount) || 0,
          daily_limit: Number(budget.daily_limit) || 0,
          warning_percent: Number(budget.warning_percent) || 80,
          frequency_limit: Number(budget.frequency_limit) || 0,
          frequency_period: String(budget.frequency_period || ''),
          spent_amount: Number(budget.spent_amount) || 0,
          today_spent: todaySpent,
          today_count: todayCount,
          week_count: weekCount,
          month_count: monthCount,
        },
        today,
      );

      return {
        ...budget,
        rollover_enabled: Number(budget.rollover_enabled) || 0,
        rollover_mode: budget.rollover_mode === 'all' ? 'all' : 'positive_only',
        rollover_amount: Number(budget.rollover_amount) || 0,
        effective_budget: evaluated.effectiveBudget,
        today_spent: todaySpent,
        today_count: todayCount,
        week_count: weekCount,
        month_count: monthCount,
        alerts: evaluated.alerts,
      };
    });

    return NextResponse.json(enriched);
  } catch (error) {
    if (error instanceof LedgerAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return NextResponse.json({ error: 'Failed to fetch budgets' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: unknown = await request.json();
    if (!isRecord(body)) return NextResponse.json({ error: 'Dữ liệu ngân sách không hợp lệ.' }, { status: 400 });
    const categoryId = Number(body.category_id);
    const month = typeof body.month === 'string' ? body.month : '';
    const budgetBasis = body.budget_basis === 'daily' ? 'daily' : 'monthly';
    const budgetDays = Number(body.budget_days);
    const dailyAmount = Number(body.daily_amount);
    const monthlyAmount = Number(body.budget_amount);
    const monthDays = getDaysInMonth(month);
    const budgetAmount = budgetBasis === 'daily' ? dailyAmount * budgetDays : monthlyAmount;
    const warningPercent = Math.min(100, Math.max(1, Number(body.warning_percent) || 80));
    const dailyLimit = Math.max(0, Number(body.daily_limit) || 0);
    const frequencyLimit = Math.max(0, Number(body.frequency_limit) || 0);
    const frequencyPeriod = typeof body.frequency_period === 'string' ? body.frequency_period : '';
    const rolloverEnabled = body.rollover_enabled === true || Number(body.rollover_enabled) === 1 ? 1 : 0;
    const rolloverMode = body.rollover_mode === 'all' ? 'all' : 'positive_only';

    if (
      !Number.isInteger(categoryId)
      || categoryId <= 0
      || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)
      || !Number.isFinite(budgetAmount)
      || budgetAmount <= 0
      || (budgetBasis === 'daily' && (!Number.isFinite(dailyAmount) || dailyAmount <= 0 || !Number.isInteger(budgetDays) || budgetDays < 1 || budgetDays > monthDays))
    ) {
      return NextResponse.json({ error: 'Kiểm tra danh mục, tháng, số tiền và số ngày ngân sách.' }, { status: 400 });
    }
    const db = await getDb();
    const { ledgerId } = await ensureUserLedgerAndAccount(db, user.id);
    await assertLedgerAccess(db, user.id, ledgerId, 'editor');
    const category = await db.execute({
      sql: "SELECT id FROM categories WHERE id = ? AND (user_id IS NULL OR user_id = ?) AND kind <> 'income'",
      args: [categoryId, user.id],
    });
    if (!category.rows[0]) return NextResponse.json({ error: 'Danh mục chi tiêu không hợp lệ.' }, { status: 400 });

    const existingResult = await db.execute({
      sql: 'SELECT id FROM budget_jars WHERE (ledger_id = ? OR (ledger_id IS NULL AND user_id = ?)) AND category_id = ? AND month = ?',
      args: [ledgerId, user.id, categoryId, month],
    });

    if (existingResult.rows.length > 0) {
      const existingId = existingResult.rows[0].id;
      await db.execute({
        sql: `UPDATE budget_jars
              SET ledger_id = COALESCE(ledger_id, ?),
                  budget_amount = ?, budget_basis = ?, daily_amount = ?, budget_days = ?,
                  warning_percent = ?, daily_limit = ?, frequency_limit = ?, frequency_period = ?,
                  rollover_enabled = ?, rollover_mode = ?
              WHERE id = ? AND user_id = ?`,
        args: [
          ledgerId,
          budgetAmount,
          budgetBasis,
          budgetBasis === 'daily' ? dailyAmount : 0,
          budgetBasis === 'daily' ? budgetDays : 0,
          warningPercent,
          dailyLimit,
          frequencyLimit,
          frequencyPeriod,
          rolloverEnabled,
          rolloverMode,
          existingId,
          user.id,
        ],
      });
      return NextResponse.json({
        id: existingId,
        category_id: categoryId,
        month,
        budget_amount: budgetAmount,
        budget_basis: budgetBasis,
        daily_amount: budgetBasis === 'daily' ? dailyAmount : 0,
        budget_days: budgetBasis === 'daily' ? budgetDays : 0,
        warning_percent: warningPercent,
        daily_limit: dailyLimit,
        frequency_limit: frequencyLimit,
        frequency_period: frequencyPeriod,
        rollover_enabled: rolloverEnabled,
        rollover_mode: rolloverMode,
      });
    } else {
      const info = await db.execute({
        sql: `INSERT INTO budget_jars
                (user_id, ledger_id, category_id, month, budget_amount, budget_basis, daily_amount, budget_days,
                 warning_percent, daily_limit, frequency_limit, frequency_period, rollover_enabled, rollover_mode)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          user.id,
          ledgerId,
          categoryId,
          month,
          budgetAmount,
          budgetBasis,
          budgetBasis === 'daily' ? dailyAmount : 0,
          budgetBasis === 'daily' ? budgetDays : 0,
          warningPercent,
          dailyLimit,
          frequencyLimit,
          frequencyPeriod,
          rolloverEnabled,
          rolloverMode,
        ],
      });
      return NextResponse.json(
        {
          id: Number(info.lastInsertRowid),
          category_id: categoryId,
          month,
          budget_amount: budgetAmount,
          budget_basis: budgetBasis,
          daily_amount: budgetBasis === 'daily' ? dailyAmount : 0,
          budget_days: budgetBasis === 'daily' ? budgetDays : 0,
          warning_percent: warningPercent,
          daily_limit: dailyLimit,
          frequency_limit: frequencyLimit,
          frequency_period: frequencyPeriod,
          rollover_enabled: rolloverEnabled,
          rollover_mode: rolloverMode,
        },
        { status: 201 },
      );
    }
  } catch (error) {
    if (error instanceof LedgerAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return NextResponse.json({ error: 'Failed to save budget' }, { status: 500 });
  }
}

function getDaysInMonth(month: string) {
  const match = month.match(/^(\d{4})-(\d{2})$/);
  if (!match) return 0;
  return new Date(Number(match[1]), Number(match[2]), 0).getDate();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
