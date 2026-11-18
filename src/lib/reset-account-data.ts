import type { Client } from '@libsql/client';

const ACCOUNT_DATA_TABLES = [
  'expense_chat_requests',
  'expenses',
  'budget_jars',
  'categories',
  'debt_payments',
  'debt_jars',
  'debts',
  'ai_insights',
  'ai_models',
  'ai_providers',
  'notification_deliveries',
  'pwa_push_subscriptions',
  'user_settings',
];

export async function resetAccountData(db: Client, userId: number) {
  await db.batch(
    ACCOUNT_DATA_TABLES.map((table) => ({
      sql: `DELETE FROM ${table} WHERE user_id = ?`,
      args: [userId],
    })),
    'write',
  );
}
