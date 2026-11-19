import 'server-only';

import type { Client } from '@libsql/client';
import type { LedgerKind, LedgerRole } from '@/lib/ledger-access';
import {
  isPersonaId,
  parseEnabledModulesJson,
  resolveModulesForPersonas,
  type EnabledModules,
  type PersonaId,
} from '@/lib/modules';

export interface UserLedgerContext {
  ledgerId: number;
  activeLedgerName: string;
  activeLedgerKind: LedgerKind;
  activeLedgerRole: LedgerRole;
  defaultAccountId: number;
  primaryPersona: PersonaId;
  personas: PersonaId[];
  modules: EnabledModules;
  onboardedAt: string | null;
}

export async function ensureUserLedgerAndAccount(
  db: Client,
  userId: number,
): Promise<{
  ledgerId: number;
  ledgerName: string;
  ledgerKind: LedgerKind;
  role: LedgerRole;
  defaultAccountId: number;
}> {
  const profileRes = await db.execute({
    sql: 'SELECT active_ledger_id FROM user_profiles WHERE user_id = ? LIMIT 1',
    args: [userId],
  });
  let ledgerId = Number(profileRes.rows[0]?.active_ledger_id || 0);
  let ledgerName = 'Ví cá nhân';
  let ledgerKind: LedgerKind = 'personal';
  let role: LedgerRole = 'owner';

  // Verify user actually has access to active_ledger_id (handles deleted or left shared ledgers)
  if (ledgerId) {
    const accessRes = await db.execute({
      sql: `SELECT l.id, l.name, l.kind, COALESCE(lm.role, CASE WHEN l.owner_id = ? THEN 'owner' END) AS role
            FROM ledgers l
            LEFT JOIN ledger_members lm ON lm.ledger_id = l.id AND lm.user_id = ?
            WHERE l.id = ?
              AND (l.owner_id = ? OR lm.user_id IS NOT NULL)
            LIMIT 1`,
      args: [userId, userId, ledgerId, userId],
    });
    const row = accessRes.rows[0];
    if (row) {
      ledgerName = String(row.name || 'Ví cá nhân');
      ledgerKind = row.kind === 'family' || row.kind === 'business' ? row.kind : 'personal';
      role = row.role === 'viewer' || row.role === 'editor' ? row.role : 'owner';
    } else {
      ledgerId = 0;
    }
  }

  if (!ledgerId) {
    const existingMemberLedger = await db.execute({
      sql: `SELECT l.id, l.name, l.kind, COALESCE(lm.role, CASE WHEN l.owner_id = ? THEN 'owner' END) AS role
            FROM ledgers l
            LEFT JOIN ledger_members lm ON lm.ledger_id = l.id AND lm.user_id = ?
            WHERE l.owner_id = ? OR lm.user_id = ?
            ORDER BY CASE WHEN l.owner_id = ? THEN 0 ELSE 1 END, l.id ASC
            LIMIT 1`,
      args: [userId, userId, userId, userId, userId],
    });

    if (existingMemberLedger.rows[0]) {
      const row = existingMemberLedger.rows[0];
      ledgerId = Number(row.id);
      ledgerName = String(row.name || 'Ví cá nhân');
      ledgerKind = row.kind === 'family' || row.kind === 'business' ? row.kind : 'personal';
      role = row.role === 'viewer' || row.role === 'editor' ? row.role : 'owner';
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
            ON CONFLICT(user_id) DO UPDATE SET active_ledger_id = excluded.active_ledger_id`,
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

  return { ledgerId, ledgerName, ledgerKind, role, defaultAccountId };
}

export async function getUserLedgerContext(
  db: Client,
  userId: number,
): Promise<UserLedgerContext> {
  const { ledgerId, ledgerName, ledgerKind, role, defaultAccountId } =
    await ensureUserLedgerAndAccount(db, userId);

  const result = await db.execute({
    sql: `SELECT u.onboarded_at, p.primary_persona, p.personas_json, p.enabled_modules_json
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
    ledgerId,
    activeLedgerName: ledgerName,
    activeLedgerKind: ledgerKind,
    activeLedgerRole: role,
    defaultAccountId,
    primaryPersona,
    personas,
    modules,
    onboardedAt: row?.onboarded_at ? String(row.onboarded_at) : null,
  };
}
