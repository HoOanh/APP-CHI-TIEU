import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/current-user';
import { getDb } from '@/lib/db';
import { ensureUserLedgerAndAccount } from '@/lib/ledger-context';
import {
  isPersonaId,
  PERSONA_PRESETS,
  resolveModulesForPersonas,
  type PersonaId,
} from '@/lib/modules';

const onboardingSchema = z.object({
  skip: z.boolean().optional(),
  primaryPersona: z.string().optional(),
  personas: z.array(z.string()).max(6).optional(),
  mainAccountName: z.string().trim().min(1).max(60).optional(),
  initialBalance: z.coerce.number().finite().min(-10_000_000_000).max(10_000_000_000).optional(),
  additionalAccounts: z.array(z.object({
    name: z.string().trim().min(1).max(60),
    type: z.enum(['cash', 'bank', 'ewallet', 'credit_card', 'savings']),
    initial_balance: z.coerce.number().finite().min(-10_000_000_000).max(10_000_000_000).optional().default(0),
  })).max(5).optional(),
  seedIncomeCategories: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rawBody: unknown = await request.json().catch(() => null);
  const parsed = onboardingSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'Dữ liệu khởi tạo chưa hợp lệ.' },
      { status: 400 },
    );
  }

  const db = await getDb();
  const { ledgerId, defaultAccountId } = await ensureUserLedgerAndAccount(db, user.id);

  if (parsed.data.skip) {
    const defaultPersonas: PersonaId[] = ['speed_tracker'];
    const defaultModules = resolveModulesForPersonas(defaultPersonas);
    await db.batch([
      {
        sql: `INSERT INTO user_profiles (user_id, primary_persona, personas_json, enabled_modules_json, active_ledger_id, updated_at)
              VALUES (?, 'speed_tracker', '["speed_tracker"]', ?, ?, datetime('now'))
              ON CONFLICT(user_id) DO UPDATE SET
                enabled_modules_json = excluded.enabled_modules_json,
                updated_at = datetime('now')`,
        args: [user.id, JSON.stringify(defaultModules), ledgerId],
      },
      {
        sql: "UPDATE users SET onboarded_at = COALESCE(onboarded_at, datetime('now')), updated_at = datetime('now') WHERE id = ?",
        args: [user.id],
      },
    ], 'write');
    return NextResponse.json({ ok: true, redirectTo: '/' });
  }

  const selectedPersonas = (parsed.data.personas ?? []).filter(isPersonaId);
  const personas: PersonaId[] = selectedPersonas.length > 0
    ? selectedPersonas
    : isPersonaId(parsed.data.primaryPersona)
      ? [parsed.data.primaryPersona]
      : ['speed_tracker'];
  const primaryPersona: PersonaId = isPersonaId(parsed.data.primaryPersona) && personas.includes(parsed.data.primaryPersona)
    ? parsed.data.primaryPersona
    : personas[0];
  const modules = resolveModulesForPersonas(personas);

  const stmts: Array<{ sql: string; args: Array<string | number> }> = [
    {
      sql: `INSERT INTO user_profiles (user_id, primary_persona, personas_json, enabled_modules_json, active_ledger_id, updated_at)
            VALUES (?, ?, ?, ?, ?, datetime('now'))
            ON CONFLICT(user_id) DO UPDATE SET
              primary_persona = excluded.primary_persona,
              personas_json = excluded.personas_json,
              enabled_modules_json = excluded.enabled_modules_json,
              updated_at = datetime('now')`,
      args: [user.id, primaryPersona, JSON.stringify(personas), JSON.stringify(modules), ledgerId],
    },
    {
      sql: "UPDATE users SET onboarded_at = COALESCE(onboarded_at, datetime('now')), updated_at = datetime('now') WHERE id = ?",
      args: [user.id],
    },
  ];

  if (parsed.data.mainAccountName !== undefined || parsed.data.initialBalance !== undefined) {
    stmts.push({
      sql: `UPDATE accounts
            SET name = COALESCE(?, name),
                initial_balance = COALESCE(?, initial_balance)
            WHERE id = ? AND user_id = ?`,
      args: [
        parsed.data.mainAccountName ?? 'Ví chính',
        parsed.data.initialBalance ?? 0,
        defaultAccountId,
        user.id,
      ],
    });
  }

  if (parsed.data.additionalAccounts?.length) {
    for (const acc of parsed.data.additionalAccounts) {
      stmts.push({
        sql: `INSERT INTO accounts (ledger_id, user_id, name, type, initial_balance, is_default)
              VALUES (?, ?, ?, ?, ?, 0)`,
        args: [ledgerId, user.id, acc.name, acc.type, acc.initial_balance ?? 0],
      });
    }
  }

  if (parsed.data.seedIncomeCategories) {
    const starterIncome = [
      ['Lương', 'banknote', '#00BC7C', 'income', 'savings'],
      ['Thưởng & Phụ cấp', 'sparkles', '#10B981', 'income', 'savings'],
    ];
    for (const [name, icon, color, kind, group] of starterIncome) {
      stmts.push({
        sql: `INSERT OR IGNORE INTO categories (user_id, ledger_id, name, icon, color, kind, budget_group)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [user.id, ledgerId, name, icon, color, kind, group],
      });
    }
  }

  await db.batch(stmts, 'write');

  const preset = PERSONA_PRESETS.find((item) => item.id === primaryPersona);
  return NextResponse.json({
    ok: true,
    primaryPersona,
    modules,
    redirectTo: preset?.defaultLanding ?? '/',
  });
}
