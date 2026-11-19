import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import {
  normalizeMerchantKeyword,
  parseFastPathTransaction,
  parseFastPathTransfer,
} from '../src/lib/fast-path-parser.ts';
import { answerFinancialQuestion, isFinancialQuestion } from '../src/lib/financial-qa.ts';
import { simulateDebtPayoff } from '../src/lib/debt-simulator.ts';
import { authenticateShortcutBearer, generateShortcutToken } from '../src/lib/shortcut-auth.ts';
import { initializeDatabase } from '../src/lib/schema.ts';

test('Fast-Path 0ms resolves merchant rules, unanimous history, built-in rules, and transfers', () => {
  const categories = [
    { id: '1', name: 'Ăn uống', color: '#FE5A61', kind: 'expense' },
    { id: '2', name: 'AI', color: '#14B8A6', kind: 'expense' },
    { id: '3', name: 'Thu nhập', color: '#00BC7C', kind: 'income' },
  ];
  const rules = [
    {
      id: 10,
      keyword: normalizeMerchantKeyword('cursor pro'),
      categoryId: '2',
      categoryName: 'AI',
      categoryColor: '#14B8A6',
      type: 'expense' as const,
      accountId: null,
    },
  ];

  const ruleMatch = parseFastPathTransaction({
    message: 'Cursor Pro 500k',
    today: '2026-11-19',
    categories,
    budgetCategories: ['Ăn uống'],
    merchantRules: rules,
    historyRows: [],
  });
  assert.equal(ruleMatch?.categoryName, 'AI');
  assert.equal(ruleMatch?.amount, 500_000);
  assert.equal(ruleMatch?.matchSource, 'merchant_rule');

  const builtinMatch = parseFastPathTransaction({
    message: 'Ăn trưa 45k',
    today: '2026-11-19',
    categories,
    budgetCategories: ['Ăn uống'],
    merchantRules: [],
    historyRows: [],
  });
  assert.equal(builtinMatch?.categoryName, 'Ăn uống');
  assert.equal(builtinMatch?.amount, 45_000);
  assert.equal(builtinMatch?.matchSource, 'builtin_keyword');

  const coffeeMatch = parseFastPathTransaction({
    message: 'Cà phê 35k',
    today: '2026-11-19',
    categories,
    budgetCategories: ['Ăn uống'],
    merchantRules: [],
    historyRows: [],
  });
  assert.equal(coffeeMatch?.categoryName, 'Ăn uống');
  assert.equal(coffeeMatch?.amount, 35_000);
  assert.equal(coffeeMatch?.matchSource, 'builtin_keyword');

  assert.equal(
    parseFastPathTransaction({
      message: 'Tháng này ăn uống hết bao nhiêu?',
      today: '2026-11-19',
      categories,
      budgetCategories: [],
      merchantRules: [],
      historyRows: [],
    }),
    null,
  );

  const transfer = parseFastPathTransfer({
    message: 'Chuyển 2tr từ Ngân hàng sang Ví chính',
    today: '2026-11-19',
    accounts: [
      { id: 1, name: 'Ví chính', isDefault: true },
      { id: 2, name: 'Tài khoản ngân hàng', isDefault: false },
    ],
  });
  assert.equal(transfer?.amount, 2_000_000);
  assert.equal(transfer?.fromAccountId, 2);
  assert.equal(transfer?.toAccountId, 1);
});

test('Financial Q&A distinguishes questions and answers accurately from SQLite data', async () => {
  assert.equal(isFinancialQuestion('Tháng này ăn uống hết bao nhiêu?'), true);
  assert.equal(isFinancialQuestion('Ăn phở 50k'), false);

  const db = createClient({ url: ':memory:' });
  await initializeDatabase(db);
  await db.execute("INSERT INTO users (id, email, name) VALUES (1, 'qa@example.com', 'QA')");
  await db.execute("INSERT INTO ledgers (id, owner_id, name, kind) VALUES (1, 1, 'Ví cá nhân', 'personal')");
  await db.execute("INSERT INTO accounts (id, ledger_id, user_id, name, type, initial_balance, is_default) VALUES (1, 1, 1, 'Ví chính', 'cash', 1000000, 1)");
  const catRes = await db.execute("SELECT id FROM categories WHERE name = 'Ăn uống' LIMIT 1");
  const foodCatId = Number(catRes.rows[0].id);
  const currentMonth = new Date().toISOString().slice(0, 7);
  await db.execute({
    sql: "INSERT INTO expenses (user_id, ledger_id, account_id, amount, description, category_id, expense_date, type) VALUES (1, 1, 1, 120000, 'Bún bò', ?, ?, 'expense')",
    args: [foodCatId, `${currentMonth}-10`],
  });

  const qa = await answerFinancialQuestion(db, 1, 1, 'Tháng này ăn uống hết bao nhiêu?');
  assert.match(qa.answer, /120\.000đ/);
  assert.ok(qa.metrics.length >= 1);
});

test('Debt Simulator compares Avalanche vs Snowball correctly', () => {
  const debts = [
    { id: '1', name: 'Thẻ tín dụng', remaining: 10_000_000, interestRateAnnual: 24 },
    { id: '2', name: 'Vay người thân', remaining: 5_000_000, interestRateAnnual: 0 },
  ];
  const avalanche = simulateDebtPayoff({
    debts,
    monthlyBudget: 3_000_000,
    strategy: 'avalanche',
    startMonth: '2026-11',
  });
  const snowball = simulateDebtPayoff({
    debts,
    monthlyBudget: 3_000_000,
    strategy: 'snowball',
    startMonth: '2026-11',
  });

  assert.equal(avalanche.perDebtPayoff[0].name, 'Thẻ tín dụng');
  assert.equal(snowball.perDebtPayoff[0].name, 'Vay người thân');
  assert.ok(avalanche.totalInterestPaid <= snowball.totalInterestPaid);

  const insufficient = simulateDebtPayoff({
    debts,
    monthlyBudget: 100_000,
    strategy: 'avalanche',
    startMonth: '2026-11',
  });
  assert.ok(insufficient.warning);
});

test('Shortcut Bearer tokens authenticate active keys and reject revoked keys', async () => {
  const db = createClient({ url: ':memory:' });
  await initializeDatabase(db);
  await db.execute("INSERT INTO users (id, email, name) VALUES (1, 'sc@example.com', 'SC')");
  await db.execute("INSERT INTO ledgers (id, owner_id, name, kind) VALUES (1, 1, 'Ví cá nhân', 'personal')");
  await db.execute("INSERT INTO accounts (id, ledger_id, user_id, name, type, initial_balance, is_default) VALUES (1, 1, 1, 'Ví chính', 'cash', 0, 1)");

  const { rawToken, keyPrefix, keyHash } = generateShortcutToken();
  await db.execute({
    sql: "INSERT INTO shortcut_keys (id, user_id, ledger_id, default_account_id, name, key_prefix, key_hash) VALUES (1, 1, 1, 1, 'iPhone', ?, ?)",
    args: [keyPrefix, keyHash],
  });

  const auth = await authenticateShortcutBearer(db, `Bearer ${rawToken}`);
  assert.equal(auth?.userId, 1);
  assert.equal(auth?.defaultAccountId, 1);

  await db.execute("UPDATE shortcut_keys SET revoked_at = datetime('now') WHERE id = 1");
  const afterRevoke = await authenticateShortcutBearer(db, `Bearer ${rawToken}`);
  assert.equal(afterRevoke, null);
});
