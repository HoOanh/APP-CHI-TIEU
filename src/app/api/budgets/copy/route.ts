import { NextRequest, NextResponse } from 'next/server';
import { computeRolloverCarryover } from '@/lib/budget-evaluator';
import { getCurrentUser } from '@/lib/current-user';
import { getDb } from '@/lib/db';
import { ensureUserLedgerAndAccount } from '@/lib/ledger-context';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { from_month, to_month } = await request.json();
    if (!from_month || !to_month) {
      return NextResponse.json({ error: 'from_month and to_month required' }, { status: 400 });
    }

    const db = await getDb();
    const { ledgerId } = await ensureUserLedgerAndAccount(db, user.id);

    const previousBudgets = await db.execute({
      sql: `SELECT b.*,
                   COALESCE((
                     SELECT SUM(e.amount)
                     FROM expenses e
                     WHERE e.user_id = b.user_id
                       AND e.category_id = b.category_id
                       AND e.type = 'expense'
                       AND strftime('%Y-%m', e.expense_date) = b.month
                   ), 0) AS spent_amount
            FROM budget_jars b
            WHERE b.user_id = ? AND b.month = ?`,
      args: [user.id, from_month],
    });
    const targetDays = getDaysInMonth(String(to_month));

    const insertSql = `
      INSERT INTO budget_jars
        (user_id, ledger_id, category_id, month, budget_amount, budget_basis, daily_amount, budget_days,
         warning_percent, daily_limit, frequency_limit, frequency_period, rollover_enabled, rollover_mode, rollover_amount)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, category_id, month) DO UPDATE SET
        ledger_id = excluded.ledger_id,
        budget_amount = excluded.budget_amount,
        budget_basis = excluded.budget_basis,
        daily_amount = excluded.daily_amount,
        budget_days = excluded.budget_days,
        warning_percent = excluded.warning_percent,
        daily_limit = excluded.daily_limit,
        frequency_limit = excluded.frequency_limit,
        frequency_period = excluded.frequency_period,
        rollover_enabled = excluded.rollover_enabled,
        rollover_mode = excluded.rollover_mode,
        rollover_amount = excluded.rollover_amount
    `;

    const stmts = previousBudgets.rows.map((b) => {
      const basis = b.budget_basis === 'daily' ? 'daily' : 'monthly';
      const days = basis === 'daily' ? targetDays : 0;
      const dailyAmount = basis === 'daily' ? Number(b.daily_amount) || 0 : 0;
      const rolloverEnabled = Number(b.rollover_enabled) === 1;
      const rolloverMode = b.rollover_mode === 'all' ? 'all' : 'positive_only';
      const carryover = computeRolloverCarryover({
        budgetAmount: Number(b.budget_amount) || 0,
        rolloverAmount: Number(b.rollover_amount) || 0,
        spentAmount: Number(b.spent_amount) || 0,
        rolloverEnabled,
        rolloverMode,
      });

      return {
        sql: insertSql,
        args: [
          user.id,
          ledgerId,
          b.category_id,
          to_month,
          basis === 'daily' ? dailyAmount * days : b.budget_amount,
          basis,
          dailyAmount,
          days,
          b.warning_percent,
          b.daily_limit || 0,
          b.frequency_limit || 0,
          b.frequency_period || '',
          rolloverEnabled ? 1 : 0,
          rolloverMode,
          carryover,
        ],
      };
    });

    if (stmts.length > 0) {
      await db.batch(stmts, 'write');
    }

    return NextResponse.json({ success: true, copied: stmts.length });
  } catch (error) {
    console.error('[POST /api/budgets/copy]', error);
    return NextResponse.json({ error: 'Failed to copy budgets' }, { status: 500 });
  }
}

function getDaysInMonth(month: string) {
  const match = month.match(/^(\d{4})-(\d{2})$/);
  return match ? new Date(Number(match[1]), Number(match[2]), 0).getDate() : 0;
}
