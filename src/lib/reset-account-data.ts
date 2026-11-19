import type { Client } from '@libsql/client';

const ACCOUNT_DATA_TABLES = [
  'expense_chat_requests',
  'recurring_occurrences',
  'recurring_rules',
  'shortcut_keys',
  'merchant_rules',
  'debt_payments',
  'debt_jars',
  'debts',
  'expenses',
  'budget_jars',
  'categories',
  'accounts',
  'ledger_members',
  'ai_insights',
  'ai_models',
  'ai_providers',
  'notification_deliveries',
  'pwa_push_subscriptions',
  'auth_tokens',
  'user_profiles',
  'user_settings',
];

export async function resetAccountData(db: Client, userId: number) {
  await db.batch(
    [
      ...ACCOUNT_DATA_TABLES.map((table) => ({
        sql: `DELETE FROM ${table} WHERE user_id = ?`,
        args: [userId],
      })),
      {
        sql: 'DELETE FROM ledgers WHERE owner_id = ?',
        args: [userId],
      },
    ],
    'write',
  );
}
