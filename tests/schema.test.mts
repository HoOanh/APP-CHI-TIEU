import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createClient } from '@libsql/client';
import { initializeDatabase } from '../src/lib/schema.ts';
import { resetAccountData } from '../src/lib/reset-account-data.ts';

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

  const schemaVersion = await db.execute("SELECT value FROM settings WHERE key = 'schema_version'");
  assert.equal(schemaVersion.rows.length, 1);
  await initializeDatabase(db);
});

test('migrates v1.2.2 legacy categories/data safely and allows per-user category names', async (context) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'chi-tieu-v2-migrate-'));
  const databasePath = path.join(directory, 'legacy.db');
  const db = createClient({ url: `file:${databasePath}` });

  context.after(async () => {
    db.close();
    await rm(directory, { recursive: true });
  });

  // Simulate v1.2.2 schema before v2.0 migration
  await db.executeMultiple(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL DEFAULT '',
      avatar TEXT DEFAULT '',
      password_hash TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      name TEXT NOT NULL UNIQUE,
      icon TEXT NOT NULL DEFAULT '📦',
      color TEXT NOT NULL DEFAULT '#64748b',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      description TEXT NOT NULL,
      note TEXT DEFAULT '',
      category_id INTEGER NOT NULL,
      expense_date TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'expense',
      client_request_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE budget_jars (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      month TEXT NOT NULL,
      budget_amount REAL NOT NULL,
      warning_percent REAL NOT NULL DEFAULT 80,
      daily_limit REAL DEFAULT 0,
      frequency_limit INTEGER DEFAULT 0,
      frequency_period TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, category_id, month)
    );
    CREATE TABLE debts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      creditor TEXT NOT NULL DEFAULT '',
      total_amount REAL NOT NULL,
      interest_rate REAL NOT NULL DEFAULT 0,
      start_date TEXT NOT NULL,
      due_date TEXT NOT NULL,
      note TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE debt_jars (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      debt_id INTEGER NOT NULL,
      month TEXT NOT NULL,
      planned_amount REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, debt_id, month)
    );
    CREATE TABLE debt_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      debt_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      payment_date TEXT NOT NULL,
      note TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT INTO settings (key, value) VALUES ('schema_version', '2026-11-18-v1');
    INSERT INTO users (id, email, name) VALUES (1, 'legacy@example.com', 'Legacy User'), (2, 'second@example.com', 'Second User');
    INSERT INTO categories (id, user_id, name, icon, color) VALUES (1, NULL, 'Thu nhập', 'banknote', '#00BC7C'), (2, 1, 'Cafe', 'coffee', '#111111');
    INSERT INTO expenses (user_id, amount, description, category_id, expense_date) VALUES (1, 45000, 'Cà phê sáng', 2, '2026-11-18');
  `);

  await initializeDatabase(db);

  // Verify legacy expense & category IDs preserved and backfilled
  const backfilledExpense = await db.execute('SELECT ledger_id, account_id, created_by_user_id FROM expenses WHERE user_id = 1');
  assert.ok(Number(backfilledExpense.rows[0].ledger_id) > 0);
  assert.ok(Number(backfilledExpense.rows[0].account_id) > 0);
  assert.equal(Number(backfilledExpense.rows[0].created_by_user_id), 1);

  const legacyUser = await db.execute('SELECT onboarded_at FROM users WHERE id = 1');
  assert.ok(legacyUser.rows[0].onboarded_at);

  const secondUser = await db.execute('SELECT onboarded_at FROM users WHERE id = 2');
  assert.equal(secondUser.rows[0].onboarded_at, null);

  // User 2 can create a custom category with the same name 'Cafe' as User 1
  await db.execute({
    sql: "INSERT INTO categories (user_id, name, icon, color, kind) VALUES (2, 'Cafe', 'coffee', '#222222', 'expense')",
  });
  // Same user cannot duplicate case-insensitively
  await assert.rejects(
    db.execute({
      sql: "INSERT INTO categories (user_id, name, icon, color, kind) VALUES (2, 'cafe', 'coffee', '#333333', 'expense')",
    }),
  );

  // resetAccountData cleans up user 1 cleanly under foreign_keys = ON
  await resetAccountData(db, 1);
  const user1Expenses = await db.execute('SELECT id FROM expenses WHERE user_id = 1');
  const user1Ledgers = await db.execute('SELECT id FROM ledgers WHERE owner_id = 1');
  assert.equal(user1Expenses.rows.length, 0);
  assert.equal(user1Ledgers.rows.length, 0);
});
