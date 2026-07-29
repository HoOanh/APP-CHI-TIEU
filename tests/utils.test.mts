import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatCurrency,
  formatDate,
  getMonthLabel,
  getPercentage,
  getQuarter,
} from '../src/lib/utils.ts';

test('formats Vietnamese currency without losing precision to decimals', () => {
  assert.equal(formatCurrency(1_234_567.4), '1.234.567đ');
  assert.equal(formatCurrency(Number.NaN), '0đ');
});

test('formats dates and reporting labels consistently', () => {
  assert.equal(formatDate('2026-07-29T00:00:00.000Z'), '29/07/2026');
  assert.equal(getMonthLabel('2026-07'), 'Tháng 7/2026');
  assert.equal(getQuarter('2026-07'), 3);
});

test('caps progress at 100 percent and handles an empty target', () => {
  assert.equal(getPercentage(75, 100), 75);
  assert.equal(getPercentage(150, 100), 100);
  assert.equal(getPercentage(10, 0), 0);
});
