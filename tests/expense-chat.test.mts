import assert from 'node:assert/strict';
import test from 'node:test';
import { createClient } from '@libsql/client';
import { findChatTransactions, saveChatTransactions, type ChatTransaction } from '../src/lib/expense-chat.ts';
import { initializeDatabase } from '../src/lib/schema.ts';

test('chat saves a batch once and rolls back the entire batch on failure', async (context) => {
  const db = createClient({ url: ':memory:' });
  context.after(() => db.close());
  await initializeDatabase(db);
  await db.execute("INSERT INTO users (id, email) VALUES (1, 'a@example.com'), (2, 'b@example.com')");
  await db.execute(`CREATE TRIGGER reject_test_expense BEFORE INSERT ON expenses
    WHEN NEW.description = 'Reject' BEGIN SELECT RAISE(ABORT, 'test failure'); END`);
  const category = await db.execute("SELECT id FROM categories WHERE name = 'Ăn uống'");
  const lunch: ChatTransaction = {
    description: 'Ăn trưa',
    amount: 45_000,
    category_id: String(category.rows[0].id),
    expense_date: '2026-11-18',
    note: 'Ghi bằng AI',
    type: 'expense',
  };
  const coffee = { ...lunch, description: 'Cà phê', amount: 35_000 };
  const requestId = 'test-request-001';

  await assert.rejects(saveChatTransactions(db, 1, requestId, [lunch, { ...coffee, description: 'Reject' }]));
  assert.equal(await findChatTransactions(db, 1, requestId), null);
  assert.equal((await db.execute('SELECT count(*) AS count FROM expenses')).rows[0].count, 0);

  const [first, retry] = await Promise.all([
    saveChatTransactions(db, 1, requestId, [lunch, coffee]),
    saveChatTransactions(db, 1, requestId, [lunch]),
  ]);
  assert.equal(first.inserted, true);
  assert.equal(retry.inserted, false);
  assert.deepEqual(first.transactions.map((row) => row.description), ['Ăn trưa', 'Cà phê']);
  assert.deepEqual(retry.transactions, first.transactions);

  await db.execute("UPDATE expenses SET amount = 50000 WHERE description = 'Ăn trưa'");
  assert.equal((await findChatTransactions(db, 1, requestId))?.[0].amount, 50_000);
  assert.equal(await findChatTransactions(db, 2, requestId), null);
  assert.equal((await saveChatTransactions(db, 2, requestId, [coffee])).inserted, true);

  await db.execute('DELETE FROM expenses WHERE user_id = 1');
  assert.deepEqual(await saveChatTransactions(db, 1, requestId, [lunch]), { inserted: false, transactions: [] });
});
