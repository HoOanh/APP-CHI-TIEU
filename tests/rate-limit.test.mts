import assert from 'node:assert/strict';
import test from 'node:test';
import { checkRateLimit } from '../src/lib/rate-limit.ts';

test('enforces sliding-window rate limits per key', async () => {
  const key = `test-rate-${Date.now()}`;
  const first = checkRateLimit(key, 2, 50);
  const second = checkRateLimit(key, 2, 50);
  const third = checkRateLimit(key, 2, 50);

  assert.equal(first.allowed, true);
  assert.equal(first.remaining, 1);
  assert.equal(second.allowed, true);
  assert.equal(second.remaining, 0);
  assert.equal(third.allowed, false);
  assert.ok(third.retryAfterSeconds >= 1);

  await new Promise((resolve) => setTimeout(resolve, 60));
  const afterWindow = checkRateLimit(key, 2, 50);
  assert.equal(afterWindow.allowed, true);
});
