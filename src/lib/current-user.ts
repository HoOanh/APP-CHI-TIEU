import 'server-only';

import { cache } from 'react';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { getUserLedgerContext } from '@/lib/ledger-context';
import { DEFAULT_MODULES, type EnabledModules, type PersonaId } from '@/lib/modules';

export interface CurrentUser {
  id: number;
  email: string;
  name: string;
  image: string;
  isDevelopmentUser: boolean;
  onboardedAt: string | null;
  primaryPersona: PersonaId;
  personas: PersonaId[];
  modules: EnabledModules;
  activeLedgerId: number;
  defaultAccountId: number;
}

const PLACEHOLDER_CLIENT_ID = 'your-google-client-id';
const PLACEHOLDER_CLIENT_SECRET = 'your-google-client-secret';
const DEVELOPMENT_EMAIL = 'local-dev@chi-tieu.local';
let developmentUserPromise: Promise<CurrentUser | null> | undefined;

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
    sql: `INSERT INTO users (email, name, avatar, onboarded_at)
          VALUES (?, ?, '', datetime('now'))
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

  const ctx = await getUserLedgerContext(db, id);

  return {
    id,
    email: String(row.email),
    name: String(row.name || 'Local Developer'),
    image: String(row.avatar || ''),
    isDevelopmentUser: true,
    onboardedAt: ctx.onboardedAt,
    primaryPersona: ctx.primaryPersona,
    personas: ctx.personas,
    modules: ctx.modules,
    activeLedgerId: ctx.ledgerId,
    defaultAccountId: ctx.defaultAccountId,
  };
}

function getCachedDevelopmentUser() {
  developmentUserPromise ??= getDevelopmentUser().catch((error: unknown) => {
    developmentUserPromise = undefined;
    throw error;
  });
  return developmentUserPromise;
}

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth();
  if (session?.user?.id && session.user.email) {
    const userId = Number(session.user.id);
    const db = await getDb();
    let ctx: Awaited<ReturnType<typeof getUserLedgerContext>> | null = null;
    try {
      ctx = await getUserLedgerContext(db, userId);
    } catch {
      ctx = null;
    }

    return {
      id: userId,
      email: session.user.email,
      name: session.user.name || session.user.email,
      image: session.user.image || '',
      isDevelopmentUser: false,
      onboardedAt: ctx?.onboardedAt ?? null,
      primaryPersona: ctx?.primaryPersona ?? 'speed_tracker',
      personas: ctx?.personas ?? ['speed_tracker'],
      modules: ctx?.modules ?? DEFAULT_MODULES,
      activeLedgerId: ctx?.ledgerId ?? 0,
      defaultAccountId: ctx?.defaultAccountId ?? 0,
    };
  }

  if (
    !isGoogleAuthConfigured()
    && process.env.NODE_ENV !== 'production'
    && process.env.ALLOW_LOCAL_DEV_BYPASS !== 'false'
  ) {
    return getCachedDevelopmentUser();
  }

  return null;
});
