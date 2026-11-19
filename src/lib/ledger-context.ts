import 'server-only';

import type { Client } from '@libsql/client';
import {
  isPersonaId,
  parseEnabledModulesJson,
  resolveModulesForPersonas,
  type EnabledModules,
  type PersonaId,
} from '@/lib/modules';

export interface UserLedgerContext {
  ledgerId: number;
  defaultAccountId: number;
  primaryPersona: PersonaId;
  personas: PersonaId[];
  modules: EnabledModules;
  onboardedAt: string | null;
}

export async function ensureUserLedgerAndAccount(
  db: Client,
  userId: number,
): Promise<{ ledgerId: number; defaultAccountId: number }> {
  const profileRes = await db.execute({
    sql: 'SELECT active_ledger_id FROM user_profiles WHERE user_id = ? LIMIT 1',
    args: [userId],
  });
  let ledgerId = Number(profileRes.rows[0]?.active_ledger_id || 0);

  if (!ledgerId) {
    const existingLedger = await db.execute({
      sql: 'SELECT id FROM ledgers WHERE owner_id = ? ORDER BY id ASC LIMIT 1',
      args: [userId],
    });
    if (existingLedger.rows[0]) {
      ledgerId = Number(existingLedger.rows[0].id);
    } else {
      const created = await db.execute({
        sql: "INSERT INTO ledgers (owner_id, name, kind, currency) VALUES (?, 'Ví cá nhân', 'personal', 'VND')",
        args: [userId],
      });
      ledgerId = Number(created.lastInsertRowid);
      await db.execute({
        sql: `INSERT INTO ledger_members (ledger_id, user_id, role)
              VALUES (?, ?, 'owner') ON CONFLICT(ledger_id, user_id) DO NOTHING`,
        args: [ledgerId, userId],
      });
    }

    await db.execute({
      sql: `INSERT INTO user_profiles (user_id, primary_persona, personas_json, enabled_modules_json, active_ledger_id)
            VALUES (?, 'speed_tracker', '["speed_tracker"]', '{}', ?)
            ON CONFLICT(user_id) DO UPDATE SET active_ledger_id = COALESCE(user_profiles.active_ledger_id, excluded.active_ledger_id)`,
      args: [userId, ledgerId],
    });
  }

  const defaultAccountRes = await db.execute({
    sql: `SELECT id FROM accounts
          WHERE ledger_id = ? AND archived = 0
          ORDER BY is_default DESC, id ASC
          LIMIT 1`,
    args: [ledgerId],
  });
  let defaultAccountId = Number(defaultAccountRes.rows[0]?.id || 0);

  if (!defaultAccountId) {
    const createdAccount = await db.execute({
      sql: "INSERT INTO accounts (ledger_id, user_id, name, type, initial_balance, is_default) VALUES (?, ?, 'Ví chính', 'cash', 0, 1)",
      args: [ledgerId, userId],
    });
    defaultAccountId = Number(createdAccount.lastInsertRowid);
  }

  return { ledgerId, defaultAccountId };
}

export async function getUserLedgerContext(
  db: Client,
  userId: number,
): Promise<UserLedgerContext> {
  const { ledgerId, defaultAccountId } = await ensureUserLedgerAndAccount(db, userId);
  const result = await db.execute({
    sql: `SELECT u.onboarded_at, p.primary_persona, p.personas_json, p.enabled_modules_json, p.active_ledger_id
          FROM users u
          LEFT JOIN user_profiles p ON p.user_id = u.id
          WHERE u.id = ?
          LIMIT 1`,
    args: [userId],
  });
  const row = result.rows[0];
  const primaryPersona: PersonaId = isPersonaId(row?.primary_persona)
    ? row.primary_persona
    : 'speed_tracker';

  let personas: PersonaId[] = [primaryPersona];
  if (typeof row?.personas_json === 'string') {
    try {
      const parsed: unknown = JSON.parse(row.personas_json);
      if (Array.isArray(parsed)) {
        const filtered = parsed.filter(isPersonaId);
        if (filtered.length > 0) personas = filtered;
      }
    } catch {
      // Keep fallback
    }
  }

  const modules = row?.enabled_modules_json
    ? parseEnabledModulesJson(row.enabled_modules_json, personas)
    : resolveModulesForPersonas(personas);

  return {
    ledgerId: Number(row?.active_ledger_id || ledgerId),
    defaultAccountId,
    primaryPersona,
    personas,
    modules,
    onboardedAt: row?.onboarded_at ? String(row.onboarded_at) : null,
  };
}
