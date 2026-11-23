import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { evaluateBudgetJar, computeSafeToSpend } from '../src/lib/budget-evaluator.ts';
import { saveChatTransactions } from '../src/lib/expense-chat.ts';
import { resolveExplicitImageContextCategory } from '../src/lib/fast-path-parser.ts';
import { initializeDatabase, UNCLASSIFIED_EXPENSE } from '../src/lib/schema.ts';

test('resolveExplicitImageContextCategory groups image transactions by user context message', () => {
  const categories = [
    { id: '1', name: 'Ăn uống' },
    { id: '2', name: 'Xe & xăng' },
    { id: '3', name: 'Vợ' },
    { id: '4', name: UNCLASSIFIED_EXPENSE },
  ];

  const matched = resolveExplicitImageContextCategory('5 giao dịch đi chơi với vợ', categories);
  assert.equal(matched?.id, '3');
  assert.equal(matched?.name, 'Vợ');

  // Do not override when user explicitly requests splitting items
  assert.equal(
    resolveExplicitImageContextCategory('tách riêng giao dịch 1 cho vợ, giao dịch 2 ăn uống', categories),
    null,
  );
  assert.equal(resolveExplicitImageContextCategory('hóa đơn siêu thị', categories), null);
});

test('evaluateBudgetJar supports 80%, 100%, and overspend-only (>100%) thresholds', () => {
  const base = {
    id: 1,
    category_name: 'Ăn uống',
    month: '2026-11',
    budget_amount: 1_000_000,
    budget_basis: 'monthly' as const,
  };

  assert.equal(evaluateBudgetJar({ ...base, warning_percent: 80, spent_amount: 800_000 }, '2026-11-15').highestAlert?.severity, 'warning');
  assert.equal(evaluateBudgetJar({ ...base, warning_percent: 100, spent_amount: 900_000 }, '2026-11-15').highestAlert, null);
  assert.equal(evaluateBudgetJar({ ...base, warning_percent: 100, spent_amount: 1_000_000 }, '2026-11-15').highestAlert?.severity, 'danger');

  // Default >100% (101) only triggers when strictly greater than 100%
  assert.equal(evaluateBudgetJar({ ...base, warning_percent: 101, spent_amount: 1_000_000 }, '2026-11-15').highestAlert, null);
  assert.equal(evaluateBudgetJar({ ...base, warning_percent: 101, spent_amount: 1_000_001 }, '2026-11-15').highestAlert?.severity, 'danger');

  // Empty daily jars => activeJarsCount = 0
  const monthlyOnlySafe = computeSafeToSpend([{ ...base, spent_amount: 200_000 }], '2026-11', '2026-11-15');
  assert.equal(monthlyOnlySafe.activeJarsCount, 0);
  assert.equal(monthlyOnlySafe.dailySafeToSpend, 0);
});

test('Unclassified / unplanned transactions save cleanly without failing when category_id is null or Chưa phân loại', async () => {
  const db = createClient({ url: ':memory:' });
  await initializeDatabase(db);
  await db.execute("INSERT INTO users (id, email, name) VALUES (1, 'unplanned@test.local', 'User')");
  await db.execute("INSERT INTO ledgers (id, owner_id, name, kind) VALUES (1, 1, 'Ví cá nhân', 'personal')");
  await db.execute("INSERT INTO accounts (id, ledger_id, user_id, name, type, initial_balance, is_default) VALUES (1, 1, 1, 'Ví chính', 'cash', 1000000, 1)");

  const unclassifiedCat = await db.execute({
    sql: 'SELECT id FROM categories WHERE name = ? LIMIT 1',
    args: [UNCLASSIFIED_EXPENSE],
  });
  assert.ok(unclassifiedCat.rows[0]?.id, 'Chưa phân loại category should be seeded by schema');

  const saved = await saveChatTransactions(
    db,
    1,
    'req_unplanned_1',
    [
      {
        amount: 150_000,
        description: 'Chi phát sinh chưa phân loại',
        note: 'Ngoài hũ',
        category_id: null,
        expense_date: '2026-11-23',
        type: 'expense',
      },
    ],
    { ledgerId: 1, accountId: 1, source: 'chat' },
  );

  assert.equal(saved.inserted, true);
  assert.equal(saved.transactions.length, 1);
  assert.equal(Number(saved.transactions[0].amount), 150_000);
  assert.equal(saved.transactions[0].category_id, null);

  // Category overrides work per-user without affecting other users
  const foodCat = await db.execute("SELECT id FROM categories WHERE name = 'Ăn uống' LIMIT 1");
  const foodId = Number(foodCat.rows[0].id);
  await db.execute({
    sql: "INSERT INTO category_overrides (user_id, category_id, name, icon, color, kind) VALUES (1, ?, 'Ăn uống ngon', 'coffee', '#0EA5E9', 'expense')",
    args: [foodId],
  });
  const overrideRes = await db.execute({
    sql: `SELECT COALESCE(co.name, c.name) AS name, COALESCE(co.icon, c.icon) AS icon, COALESCE(co.color, c.color) AS color
          FROM categories c LEFT JOIN category_overrides co ON co.category_id = c.id AND co.user_id = 1
          WHERE c.id = ?`,
    args: [foodId],
  });
  assert.equal(overrideRes.rows[0].name, 'Ăn uống ngon');
  assert.equal(overrideRes.rows[0].icon, 'coffee');
  assert.equal(overrideRes.rows[0].color, '#0EA5E9');

  db.close();
});

test('initializeDatabase upgrades existing v2.2-s2 DB to create category_overrides for dashboard queries', async () => {
  const db = createClient({ url: ':memory:' });
  await initializeDatabase(db);
  await db.execute('DROP TABLE category_overrides');
  await db.execute("UPDATE settings SET value = '2026-11-v2.2-s2' WHERE key = 'schema_version'");

  await initializeDatabase(db);

  const tableCheck = await db.execute(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'category_overrides'",
  );
  assert.equal(tableCheck.rows.length, 1);

  await db.execute("INSERT INTO users (id, email, name) VALUES (1, 'dash@test.local', 'Dash')");
  await db.execute("INSERT INTO ledgers (id, owner_id, name, kind) VALUES (1, 1, 'Ví cá nhân', 'personal')");
  const dashQuery = await db.execute({
    sql: `SELECT COALESCE(co.name, c.name) AS name, COALESCE(co.icon, c.icon, 'tag') AS icon, COALESCE(co.color, c.color, '#64748B') AS color
          FROM categories c
          LEFT JOIN category_overrides co ON co.category_id = c.id AND co.user_id = 1
          LIMIT 5`,
    args: [],
  });
  assert.ok(dashQuery.rows.length > 0);
  db.close();
});
