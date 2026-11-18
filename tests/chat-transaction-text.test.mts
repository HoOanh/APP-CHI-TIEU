import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cleanTransactionDescription,
  findChatTransactionDate,
  parseSimpleChatTransaction,
} from '../src/lib/chat-transaction-text.ts';

const today = '2026-11-18';

test('quick chat separates the amount and Vietnamese date from meal descriptions', () => {
  assert.deepEqual(parseSimpleChatTransaction('ăn sáng 45k', today), {
    description: 'ăn sáng', amount: 45_000, date: today,
  });
  assert.deepEqual(parseSimpleChatTransaction('ăn tối ngày 17/11 100k', today), {
    description: 'ăn tối', amount: 100_000, date: '2026-11-17',
  });
  assert.deepEqual(parseSimpleChatTransaction('2 ly cà phê hôm qua 120.000đ', today), {
    description: '2 ly cà phê', amount: 120_000, date: '2026-11-17',
  });
  assert.deepEqual(parseSimpleChatTransaction('thuê sân 1.2tr', today), {
    description: 'thuê sân', amount: 1_200_000, date: today,
  });
});

test('cleans echoed model fields while preserving quantities and names', () => {
  assert.equal(cleanTransactionDescription('ăn tối ngày 17/11 100k', 100_000, today), 'ăn tối');
  assert.equal(cleanTransactionDescription('2 ly cà phê 45.000 hôm qua', 45_000, today), '2 ly cà phê');
  assert.equal(cleanTransactionDescription('cà phê bốn mươi lăm nghìn', 45_000, today), 'cà phê');
  assert.equal(cleanTransactionDescription('Quà sinh nhật năm 2026', 45_000, today), 'Quà sinh nhật năm 2026');
});

test('does not use the single-entry parser for invalid dates or ambiguous input', () => {
  assert.equal(findChatTransactionDate('ăn tối ngày 31/11 100k', today)?.date, null);
  assert.equal(parseSimpleChatTransaction('ăn 31/11 100k', today), null);
  assert.equal(parseSimpleChatTransaction('ăn sáng 45k, cà phê 25k', today), null);
  assert.equal(parseSimpleChatTransaction('ăn sáng 45k và cà phê 25', today), null);
  assert.equal(parseSimpleChatTransaction('đừng ghi ăn sáng 45k', today), null);
  assert.equal(parseSimpleChatTransaction('ăn sáng 45k?', today), null);
});
