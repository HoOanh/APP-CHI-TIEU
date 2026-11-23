import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import {
  computeRolloverCarryover,
  computeSafeToSpend,
  evaluateBudgetJar,
} from '../src/lib/budget-evaluator.ts';
import { advanceDueDate, materializeDueOccurrences } from '../src/lib/reminders-worker.ts';
import { initializeDatabase } from '../src/lib/schema.ts';

test('Budget evaluator calculates rollover carryover, frequency alerts, and Safe-to-Spend', () => {
  assert.equal(
    computeRolloverCarryover({
      budgetAmount: 3_000_000,
      rolloverAmount: 200_000,
      spentAmount: 2_500_000,
      rolloverEnabled: true,
      rolloverMode: 'positive_only',
    }),
    700_000,
  );
  assert.equal(
    computeRolloverCarryover({
      budgetAmount: 1_000_000,
      spentAmount: 1_200_000,
      rolloverEnabled: true,
      rolloverMode: 'positive_only',
    }),
    0,
  );
  assert.equal(
    computeRolloverCarryover({
      budgetAmount: 1_000_000,
      spentAmount: 1_200_000,
      rolloverEnabled: true,
      rolloverMode: 'all',
    }),
    -200_000,
  );

  const jar = {
    id: 1,
    category_name: 'Ăn uống',
    month: '2026-11',
    budget_amount: 3_000_000,
    rollover_amount: 500_000,
    budget_basis: 'daily' as const,
    daily_amount: 100_000,
    warning_percent: 80,
    frequency_limit: 2,
    frequency_period: 'day',
    spent_amount: 1_500_000,
    today_spent: 40_000,
    today_count: 2,
  };
  const monthlyJar = {
    id: 2,
    category_name: 'Nhà thuê',
    month: '2026-11',
    budget_amount: 5_000_000,
    budget_basis: 'monthly' as const,
    warning_percent: 101,
    spent_amount: 5_000_000,
  };
  const evaluated = evaluateBudgetJar(jar, '2026-11-20');
  assert.equal(evaluated.effectiveBudget, 3_500_000);
  assert.equal(evaluated.remainingMonth, 2_000_000);
  assert.equal(evaluated.highestAlert?.type, 'frequency');
  assert.equal(evaluated.highestAlert?.severity, 'danger');

  // Monthly jar with warning_percent=101 should NOT alert at exact 100%, only when strictly > 100%
  const evaluatedMonthlyExact = evaluateBudgetJar(monthlyJar, '2026-11-20');
  assert.equal(evaluatedMonthlyExact.highestAlert, null);
  const evaluatedMonthlyOver = evaluateBudgetJar({ ...monthlyJar, spent_amount: 5_100_000 }, '2026-11-20');
  assert.equal(evaluatedMonthlyOver.highestAlert?.severity, 'danger');

  // Safe-to-Spend ONLY counts daily jars and caps dailySafeToSpend at configured daily limit
  const safe = computeSafeToSpend([jar, monthlyJar], '2026-11', '2026-11-21'); // 10 days left (21..30)
  assert.equal(safe.activeJarsCount, 1);
  assert.equal(safe.daysLeft, 10);
  assert.equal(safe.totalBudgetRemaining, 2_000_000);
  assert.equal(safe.dailySafeToSpend, 100_000);
  assert.equal(safe.dailyConfiguredLimit, 100_000);
  assert.equal(safe.todayRemaining, 60_000);

  // When remaining budget drops below configured daily cap, dailySafeToSpend tightens down
  const tightSafe = computeSafeToSpend([{ ...jar, spent_amount: 3_000_000 }], '2026-11', '2026-11-21');
  assert.equal(tightSafe.dailySafeToSpend, 50_000);
});

test('Recurring reminders advance due dates cleanly and NEVER auto-deduct expenses', async () => {
  assert.equal(advanceDueDate('2026-11-01', 'weekly'), '2026-11-08');
  assert.equal(advanceDueDate('2026-11-15', 'monthly', 15), '2026-12-15');
  assert.equal(advanceDueDate('2026-11-15', 'yearly'), '2027-11-15');

  const db = createClient({ url: ':memory:' });
  await initializeDatabase(db);
  await db.execute("INSERT INTO users (id, email, name) VALUES (1, 'rec@example.com', 'Rec')");
  await db.execute("INSERT INTO ledgers (id, owner_id, name, kind) VALUES (1, 1, 'Ví cá nhân', 'personal')");
  await db.execute("INSERT INTO accounts (id, ledger_id, user_id, name, type, initial_balance, is_default) VALUES (1, 1, 1, 'Ví chính', 'cash', 1000000, 1)");
  await db.execute(`
    INSERT INTO recurring_rules (id, ledger_id, user_id, title, amount, type, account_id, cadence, day_of_month, next_due_date, enabled)
    VALUES (1, 1, 1, 'Internet Viettel', 250000, 'expense', 1, 'monthly', 1, '2020-01-01', 1)
  `);

  const created = await materializeDueOccurrences(db, 1);
  assert.equal(created.length, 1);
  assert.equal(created[0].title, 'Internet Viettel');

  const occs = await db.execute("SELECT status FROM recurring_occurrences WHERE rule_id = 1");
  assert.equal(occs.rows[0].status, 'pending');

  // Assert zero auto-deducted expenses
  const exps = await db.execute("SELECT COUNT(*) AS cnt FROM expenses WHERE user_id = 1");
  assert.equal(Number(exps.rows[0].cnt), 0);
});
