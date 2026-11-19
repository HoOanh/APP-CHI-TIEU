import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { initializeDatabase } from '../src/lib/schema.ts';
import { parseSmartSplitMessage } from '../src/lib/smart-split.ts';
import {
  extractHashtagsFromText,
  getTagsForExpenses,
  normalizeTagName,
  syncExpenseTags,
} from '../src/lib/tags.ts';

test('parseSmartSplitMessage splits group bills accurately into user expense and receivable debt', () => {
  const split = parseSmartSplitMessage('lẩu 800k chia 4, mình trả', '2026-11-19');
  assert.ok(split);
  assert.equal(split.totalAmount, 800_000);
  assert.equal(split.peopleCount, 4);
  assert.equal(split.myShare, 200_000);
  assert.equal(split.receivableAmount, 600_000);
  assert.equal(split.expenseDate, '2026-11-19');
  assert.match(split.expenseDescription, /Lẩu/i);

  const halfSplit = parseSmartSplitMessage('grab sân bay 300k chia đôi với Minh hôm qua', '2026-11-19');
  assert.ok(halfSplit);
  assert.equal(halfSplit.peopleCount, 2);
  assert.equal(halfSplit.myShare, 150_000);
  assert.equal(halfSplit.receivableAmount, 150_000);
  assert.equal(halfSplit.creditor, 'Minh');
  assert.equal(halfSplit.expenseDate, '2026-11-18');

  assert.equal(parseSmartSplitMessage('Tháng này ăn uống bao nhiêu?', '2026-11-19'), null);
  assert.equal(parseSmartSplitMessage('cà phê 45k', '2026-11-19'), null);
});

test('Hashtag extraction, normalization, syncExpenseTags, and reimburse_status work end-to-end on SQLite', async () => {
  const extracted = extractHashtagsFromText('Gặp khách hàng 350k #Du-An-A #hoan-ung');
  assert.deepEqual(extracted.tags, ['du-an-a', 'hoan-ung']);
  assert.equal(extracted.cleanedText, 'Gặp khách hàng 350k');
  assert.equal(extracted.hasReimburseHint, true);
  assert.equal(normalizeTagName('  #Chi Phí / Marketing  '), 'chi-phí-marketing');

  const db = createClient({ url: ':memory:' });
  await initializeDatabase(db);

  await db.batch([
    { sql: "INSERT INTO users (id, email, name) VALUES (1, 'biz@test.local', 'Founder')", args: [] },
    { sql: "INSERT INTO ledgers (id, owner_id, name, kind, currency) VALUES (10, 1, 'Sổ Kinh Doanh', 'business', 'VND')", args: [] },
    {
      sql: "INSERT INTO expenses (id, user_id, ledger_id, amount, description, category_id, expense_date, type, reimburse_status) VALUES (100, 1, 10, 350000, 'Tiếp khách', 1, '2026-11-19', 'expense', 'pending')",
      args: [],
    },
  ], 'write');

  const synced = await syncExpenseTags(db, 10, 100, ['du-an-a', '#Marketing', 'du-an-a']);
  assert.equal(synced.length, 2);

  const fetchedMap = await getTagsForExpenses(db, [100]);
  const rowTags = fetchedMap.get(100) ?? [];
  assert.deepEqual(
    rowTags.map((t) => t.name).sort(),
    ['du-an-a', 'marketing'],
  );

  // Overwriting tags cleanly removes old mappings without leaving dangling links
  await syncExpenseTags(db, 10, 100, ['du-an-b']);
  const afterUpdate = await getTagsForExpenses(db, [100]);
  assert.deepEqual(afterUpdate.get(100)?.map((t) => t.name), ['du-an-b']);

  db.close();
});
