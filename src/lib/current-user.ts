import 'server-only';

import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';

export interface CurrentUser {
  id: number;
  email: string;
  name: string;
  image: string;
  isDevelopmentUser: boolean;
}

const PLACEHOLDER_CLIENT_ID = 'your-google-client-id';
const PLACEHOLDER_CLIENT_SECRET = 'your-google-client-secret';
const DEVELOPMENT_EMAIL = 'local-dev@chi-tieu.local';

export function isGoogleAuthConfigured() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  return Boolean(
    clientId &&
      clientSecret &&
      clientId !== PLACEHOLDER_CLIENT_ID &&
      clientSecret !== PLACEHOLDER_CLIENT_SECRET,
  );
}

async function getDevelopmentUser(): Promise<CurrentUser | null> {
  if (process.env.NODE_ENV === 'production') return null;

  const db = await getDb();
  await db.execute({
    sql: `INSERT INTO users (email, name, avatar)
          VALUES (?, ?, '')
          ON CONFLICT(email) DO UPDATE SET updated_at = datetime('now')`,
    args: [DEVELOPMENT_EMAIL, 'Local Developer'],
  });

  const result = await db.execute({
    sql: 'SELECT id, email, name, avatar FROM users WHERE email = ?',
    args: [DEVELOPMENT_EMAIL],
  });
  const row = result.rows[0];
  if (!row) return null;

  const id = Number(row.id);
  await db.batch(
    [
      {
        sql: 'UPDATE expenses SET user_id = ? WHERE user_id IS NULL',
        args: [id],
      },
      {
        sql: 'UPDATE budget_jars SET user_id = ? WHERE user_id IS NULL',
        args: [id],
      },
      {
        sql: 'UPDATE debts SET user_id = ? WHERE user_id IS NULL',
        args: [id],
      },
      {
        sql: 'UPDATE debt_jars SET user_id = ? WHERE user_id IS NULL',
        args: [id],
      },
      {
        sql: 'UPDATE debt_payments SET user_id = ? WHERE user_id IS NULL',
        args: [id],
      },
    ],
    'write',
  );

  return {
    id,
    email: String(row.email),
    name: String(row.name || 'Local Developer'),
    image: String(row.avatar || ''),
    isDevelopmentUser: true,
  };
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  if (!isGoogleAuthConfigured()) {
    return getDevelopmentUser();
  }

  const session = await auth();
  if (!session?.user?.id || !session.user.email) return null;

  return {
    id: Number(session.user.id),
    email: session.user.email,
    name: session.user.name || session.user.email,
    image: session.user.image || '',
    isDevelopmentUser: false,
  };
}
