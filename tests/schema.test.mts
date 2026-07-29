import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createClient } from '@libsql/client';
import { initializeDatabase } from '../src/lib/schema.ts';

test('isolates budgets and transactions by user', async (context) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'chi-tieu-schema-'));
  const databasePath = path.join(directory, 'test.db');
  const db = createClient({ url: `file:${databasePath}` });

  context.after(async () => {
    db.close();
    await rm(directory, { recursive: true });
  });

  await initializeDatabase(db);
  await db.execute({
    sql: 'INSERT INTO users (email, name) VALUES (?, ?), (?, ?)',
    args: ['first@example.com', 'First', 'second@example.com', 'Second'],
  });

  const users = await db.execute('SELECT id FROM users ORDER BY id');
  const categories = await db.execute(
    "SELECT id FROM categories WHERE name = 'Ăn uống'",
  );
  const firstUserId = users.rows[0].id;
  const secondUserId = users.rows[1].id;
  const categoryId = categories.rows[0].id;

  await db.execute({
    sql: `INSERT INTO budget_jars
      (user_id, category_id, month, budget_amount)
      VALUES (?, ?, '2026-07', 1000000), (?, ?, '2026-07', 2000000)`,
    args: [firstUserId, categoryId, secondUserId, categoryId],
  });
  await db.execute({
    sql: `INSERT INTO expenses
      (user_id, amount, description, category_id, expense_date)
      VALUES (?, 100000, 'Bữa trưa', ?, '2026-07-29')`,
    args: [firstUserId, categoryId],
  });

  const firstBudgets = await db.execute({
    sql: 'SELECT budget_amount FROM budget_jars WHERE user_id = ?',
    args: [firstUserId],
  });
  const secondBudgets = await db.execute({
    sql: 'SELECT budget_amount FROM budget_jars WHERE user_id = ?',
    args: [secondUserId],
  });
  const secondExpenses = await db.execute({
    sql: 'SELECT id FROM expenses WHERE user_id = ?',
    args: [secondUserId],
  });

  assert.equal(firstBudgets.rows.length, 1);
  assert.equal(Number(firstBudgets.rows[0].budget_amount), 1_000_000);
  assert.equal(secondBudgets.rows.length, 1);
  assert.equal(Number(secondBudgets.rows[0].budget_amount), 2_000_000);
  assert.equal(secondExpenses.rows.length, 0);
});
