import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_MODULES,
  parseEnabledModulesJson,
  resolveModulesForPersonas,
} from '../src/lib/modules.ts';

test('resolves modules for single and combined personas cleanly', () => {
  const tracker = resolveModulesForPersonas(['speed_tracker']);
  assert.equal(tracker.multi_account, false);
  assert.equal(tracker.shortcuts_automation, true);

  const combined = resolveModulesForPersonas(['budget_discipliner', 'wealth_builder']);
  assert.equal(combined.multi_account, true);
  assert.equal(combined.budget_advanced, true);
  assert.equal(combined.cashflow_pro, true);
  assert.equal(combined.recurring_reminders, true);
  assert.equal(combined.shared_ledgers, false);
});

test('applies explicit module overrides over persona defaults', () => {
  const parsed = parseEnabledModulesJson(
    JSON.stringify({ multi_account: true, cashflow_pro: false }),
    ['speed_tracker'],
  );
  assert.equal(parsed.multi_account, true);
  assert.equal(parsed.cashflow_pro, false);

  const fallback = parseEnabledModulesJson('invalid-json', ['speed_tracker']);
  assert.deepEqual(fallback, DEFAULT_MODULES);
});
