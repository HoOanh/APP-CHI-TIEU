import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/current-user';
import { getDb } from '@/lib/db';
import { assertLedgerAccess, LedgerAccessError } from '@/lib/ledger-access';
import { ensureUserLedgerAndAccount } from '@/lib/ledger-context';
import { normalizeTagName } from '@/lib/tags';
import { UNCLASSIFIED_EXPENSE } from '@/lib/schema';
import { getCurrentMonth, getVietnamToday } from '@/lib/utils';

type Period = 'daily' | 'monthly' | 'quarterly' | 'yearly';

interface Range {
  start: string;
  end: string;
  comparisonStart?: string;
  comparisonEnd?: string;
  comparisonLabel?: string;
}

function monthRange(month: string): Range {
  const [year, value] = month.split('-').map(Number);
  const next = new Date(year, value, 1);
  const previous = new Date(year, value - 2, 1);
  return {
    start: `${month}-01`,
    end: `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`,
    comparisonStart: `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, '0')}-01`,
    comparisonEnd: `${month}-01`,
    comparisonLabel: 'so với tháng trước',
  };
}

function getRange(period: Period, month: string, year: string): Range {
  if (period === 'daily') return monthRange(month);
  const selectedYear = Number(year);
  if (period === 'yearly') {
    const currentYear = Number(getVietnamToday().slice(0, 4));
    return { start: `${currentYear - 4}-01-01`, end: `${currentYear + 1}-01-01` };
  }
  return {
    start: `${selectedYear}-01-01`,
    end: `${selectedYear + 1}-01-01`,
    comparisonStart: `${selectedYear - 1}-01-01`,
    comparisonEnd: `${selectedYear}-01-01`,
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
    const month = request.nextUrl.searchParams.get('month') || getCurrentMonth();
    const year = request.nextUrl.searchParams.get('year') || getVietnamToday().slice(0, 4);
    const rawTag = request.nextUrl.searchParams.get('tag')?.trim() || '';
    const activeTag = rawTag && rawTag !== 'all' ? normalizeTagName(rawTag) : '';
    const range = getRange(period, month, year);
    const db = await getDb();
    const ctx = await ensureUserLedgerAndAccount(db, user.id);
    const { ledgerId } = ctx;
    await assertLedgerAccess(db, user.id, ledgerId, 'viewer');

    const tagSql = activeTag
      ? ` AND EXISTS (
            SELECT 1 FROM expense_tags et
            JOIN tags t ON t.id = et.tag_id
            WHERE et.expense_id = e.id AND t.ledger_id = ? AND t.name = ?
          )`
      : '';
    const tagArgs: Array<string | number> = activeTag ? [ledgerId, activeTag] : [];
    const baseArgs: Array<string | number> = [ledgerId, user.id, range.start, range.end, ...tagArgs];
    const scopeSql = '(e.ledger_id = ? OR (e.ledger_id IS NULL AND e.user_id = ?))';

    const dateQuery = period === 'daily'
      ? `SELECT e.expense_date AS date, SUM(e.amount) AS total FROM expenses e WHERE ${scopeSql} AND e.type = 'expense' AND e.expense_date >= ? AND e.expense_date < ?${tagSql} GROUP BY e.expense_date ORDER BY e.expense_date`
      : period === 'monthly'
        ? `SELECT strftime('%Y-%m', e.expense_date) AS date, SUM(e.amount) AS total FROM expenses e WHERE ${scopeSql} AND e.type = 'expense' AND e.expense_date >= ? AND e.expense_date < ?${tagSql} GROUP BY date ORDER BY date`
        : period === 'quarterly'
          ? `SELECT 'Q' || CAST((CAST(strftime('%m', e.expense_date) AS INTEGER) + 2) / 3 AS INTEGER) AS date, SUM(e.amount) AS total FROM expenses e WHERE ${scopeSql} AND e.type = 'expense' AND e.expense_date >= ? AND e.expense_date < ?${tagSql} GROUP BY date ORDER BY date`
          : `SELECT strftime('%Y', e.expense_date) AS date, SUM(e.amount) AS total FROM expenses e WHERE ${scopeSql} AND e.type = 'expense' AND e.expense_date >= ? AND e.expense_date < ?${tagSql} GROUP BY date ORDER BY date`;

    const [totalResult, categoryResult, byDateResult, previousResult, balancesResult, tagBreakdownResult] = await Promise.all([
      db.execute({
        sql: `SELECT
                COALESCE(SUM(CASE WHEN e.type = 'expense' THEN e.amount ELSE 0 END), 0) AS total,
                COALESCE(SUM(CASE WHEN e.type = 'income' THEN e.amount ELSE 0 END), 0) AS income_total,
                COUNT(CASE WHEN e.type = 'expense' THEN 1 END) AS count,
                COALESCE(SUM(CASE WHEN COALESCE(e.reimburse_status, 'none') = 'pending' THEN e.amount ELSE 0 END), 0) AS pending_reimburse_total,
                COUNT(CASE WHEN COALESCE(e.reimburse_status, 'none') = 'pending' THEN 1 END) AS pending_reimburse_count,
                COALESCE(SUM(CASE WHEN COALESCE(e.reimburse_status, 'none') = 'settled' THEN e.amount ELSE 0 END), 0) AS settled_reimburse_total
              FROM expenses e
              WHERE ${scopeSql} AND e.expense_date >= ? AND e.expense_date < ?${tagSql}`,
        args: baseArgs,
      }),
      db.execute({
        sql: `SELECT COALESCE(co.name, c.name, '${UNCLASSIFIED_EXPENSE}') AS category_name,
                     COALESCE(co.icon, c.icon, 'tag') AS category_icon,
                     COALESCE(co.color, c.color, '#64748B') AS category_color,
                     SUM(e.amount) AS total, COUNT(*) AS count
              FROM expenses e
              LEFT JOIN categories c ON c.id = e.category_id
              LEFT JOIN category_overrides co ON co.category_id = c.id AND co.user_id = ?
              WHERE ${scopeSql}
                AND e.type = 'expense' AND e.expense_date >= ? AND e.expense_date < ?${tagSql}
              GROUP BY COALESCE(c.id, 0), COALESCE(co.name, c.name, '${UNCLASSIFIED_EXPENSE}'), COALESCE(co.icon, c.icon, 'tag'), COALESCE(co.color, c.color, '#64748B')
              ORDER BY total DESC LIMIT 8`,
        args: [user.id, ...baseArgs],
      }),
      db.execute({ sql: dateQuery, args: baseArgs }),
      range.comparisonStart && range.comparisonEnd
        ? db.execute({
            sql: `SELECT COALESCE(SUM(e.amount), 0) AS total
                  FROM expenses e
                  WHERE ${scopeSql} AND e.type = 'expense' AND e.expense_date >= ? AND e.expense_date < ?${tagSql}`,
            args: [ledgerId, user.id, range.comparisonStart, range.comparisonEnd, ...tagArgs],
          })
        : Promise.resolve(null),
      db.execute({
        sql: `SELECT
                COALESCE((SELECT SUM(initial_balance) FROM accounts WHERE ledger_id = ? AND archived = 0), 0)
                + COALESCE((SELECT SUM(CASE WHEN e.type = 'income' THEN e.amount WHEN e.type = 'expense' THEN -e.amount ELSE 0 END)
                            FROM expenses e WHERE ${scopeSql}), 0) AS net_worth`,
        args: [ledgerId, ledgerId, user.id],
      }),
      db.execute({
        sql: `SELECT t.id AS tag_id, t.name AS tag_name, t.color AS tag_color,
                     COALESCE(SUM(CASE WHEN e.type = 'income' THEN e.amount ELSE 0 END), 0) AS income,
                     COALESCE(SUM(CASE WHEN e.type = 'expense' THEN e.amount ELSE 0 END), 0) AS expense,
                     COUNT(e.id) AS count
              FROM tags t
              LEFT JOIN expense_tags et ON et.tag_id = t.id
              LEFT JOIN expenses e ON e.id = et.expense_id AND e.expense_date >= ? AND e.expense_date < ?
              WHERE t.ledger_id = ?
              GROUP BY t.id, t.name, t.color
              HAVING count > 0 OR COALESCE(income, 0) > 0 OR COALESCE(expense, 0) > 0
              ORDER BY (income + expense) DESC, t.name ASC`,
        args: [range.start, range.end, ledgerId],
      }),
    ]);

    const total = Number(totalResult.rows[0]?.total) || 0;
    const incomeTotal = Number(totalResult.rows[0]?.income_total) || 0;
    const netSavings = incomeTotal - total;
    const savingRatePercent = incomeTotal > 0 ? Math.round((netSavings / incomeTotal) * 100) : 0;
    const liquidBalance = Number(balancesResult.rows[0]?.net_worth) || 0;
    const burnRateMonthly = period === 'daily'
      ? total
      : period === 'monthly' || period === 'quarterly'
        ? Math.round(total / 12)
        : Math.round(total / 60);
    const runwayMonths = burnRateMonthly > 0 && liquidBalance > 0
      ? Math.round((liquidBalance / burnRateMonthly) * 10) / 10
      : null;

    const rawDates = byDateResult.rows.map((row) => ({ date: String(row.date), total: Number(row.total) || 0 }));
    const byDate = period === 'daily' ? fillMonthDays(rawDates, month) : rawDates;
    const days = period === 'daily'
      ? new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate()
      : byDate.length || 1;

    const marginPercent = incomeTotal > 0
      ? Math.round((netSavings / incomeTotal) * 1000) / 10
      : null;
    const byTag = tagBreakdownResult.rows.map((row) => {
      const inc = Number(row.income) || 0;
      const exp = Number(row.expense) || 0;
      return {
        tag_id: Number(row.tag_id),
        tag_name: String(row.tag_name),
        tag_color: String(row.tag_color || '#64748b'),
        income: inc,
        expense: exp,
        net: inc - exp,
        count: Number(row.count) || 0,
      };
    });

    const today = getVietnamToday();
    const isCurrentMonthPeriod = period === 'daily' && month === today.slice(0, 7);
    const elapsedDays = period === 'daily'
      ? (isCurrentMonthPeriod ? Math.max(1, Number(today.slice(8, 10)) || 1) : days)
      : days;

    let dailyJarAverage: number | null = null;
    if (period === 'daily') {
      const dailyJarRes = await db.execute({
        sql: `SELECT COUNT(DISTINCT b.id) AS jar_count,
                     COALESCE(SUM(e.amount), 0) AS jar_spent
              FROM budget_jars b
              LEFT JOIN expenses e ON (e.ledger_id = b.ledger_id OR (b.ledger_id IS NULL AND e.user_id = b.user_id))
                AND e.category_id = b.category_id
                AND e.type = 'expense'
                AND e.expense_date >= ? AND e.expense_date < ?
              WHERE (b.ledger_id = ? OR (b.ledger_id IS NULL AND b.user_id = ?))
                AND b.month = ?
                AND b.budget_basis = 'daily'`,
        args: [range.start, range.end, ledgerId, user.id, month],
      });
      const jarCount = Number(dailyJarRes.rows[0]?.jar_count) || 0;
      const jarSpent = Number(dailyJarRes.rows[0]?.jar_spent) || 0;
      if (jarCount > 0) {
        dailyJarAverage = Math.round(jarSpent / elapsedDays);
      }
    }

    return NextResponse.json(
      {
        total,
        income_total: incomeTotal,
        net_savings: netSavings,
        saving_rate_percent: savingRatePercent,
        liquid_balance: liquidBalance,
        runway_months: runwayMonths,
        ledgerKind: ctx.ledgerKind,
        ledgerName: ctx.ledgerName,
        tagsEnabled: Boolean(user.modules.tags_and_reimburse || ctx.ledgerKind === 'business'),
        activeTag: activeTag || null,
        pnl: {
          revenue: incomeTotal,
          operating_expense: total,
          gross_profit: netSavings,
          margin_percent: marginPercent,
          pending_reimburse_total: Number(totalResult.rows[0]?.pending_reimburse_total) || 0,
          pending_reimburse_count: Number(totalResult.rows[0]?.pending_reimburse_count) || 0,
          settled_reimburse_total: Number(totalResult.rows[0]?.settled_reimburse_total) || 0,
          by_tag: byTag,
        },
        count: Number(totalResult.rows[0]?.count) || 0,
        daily_average: dailyJarAverage ?? Math.round(total / elapsedDays),
        daily_jar_average: dailyJarAverage,
        by_category: categoryResult.rows,
        by_date: byDate,
        previous_total: Number(previousResult?.rows[0]?.total) || 0,
        comparison_label: range.comparisonLabel || '',
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    if (error instanceof LedgerAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[expense-stats]', error);
    return NextResponse.json({ error: 'Failed to get stats' }, { status: 500 });
  }
}
