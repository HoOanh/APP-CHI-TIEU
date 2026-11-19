import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/current-user';
import { getDb } from '@/lib/db';
import { getUserLedgerContext } from '@/lib/ledger-context';
import {
  ALL_MODULE_KEYS,
  isPersonaId,
  resolveModulesForPersonas,
  type EnabledModules,
  type PersonaId,
} from '@/lib/modules';
import { hashPassword, verifyPassword } from '@/lib/password';

const patchProfileSchema = z.object({
  name: z.string().trim().min(1, 'Tên hiển thị không được để trống.').max(80).optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(10, 'Mật khẩu mới cần ít nhất 10 ký tự.').max(200).optional(),
  primaryPersona: z.string().optional(),
  personas: z.array(z.string()).min(1).max(6).optional(),
  enabledModules: z.record(z.string(), z.boolean()).optional(),
  completeOnboarding: z.boolean().optional(),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = await getDb();
  const [userRes, ctx] = await Promise.all([
    db.execute({
      sql: 'SELECT password_hash, onboarded_at FROM users WHERE id = ? LIMIT 1',
      args: [user.id],
    }),
    getUserLedgerContext(db, user.id),
  ]);
  const row = userRes.rows[0];

  return NextResponse.json({
    name: user.name,
    email: user.email,
    image: user.image,
    isDevelopmentUser: user.isDevelopmentUser,
    hasPassword: Boolean(row?.password_hash),
    onboardedAt: row?.onboarded_at ? String(row.onboarded_at) : null,
    primaryPersona: ctx.primaryPersona,
    personas: ctx.personas,
    modules: ctx.modules,
    activeLedgerId: ctx.ledgerId,
    defaultAccountId: ctx.defaultAccountId,
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function PATCH(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rawBody: unknown = await request.json().catch(() => null);
  const parsed = patchProfileSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'Dữ liệu hồ sơ không hợp lệ.' },
      { status: 400 },
    );
  }

  const db = await getDb();
  const [existingResult, ctx] = await Promise.all([
    db.execute({
      sql: 'SELECT name, password_hash FROM users WHERE id = ? LIMIT 1',
      args: [user.id],
    }),
    getUserLedgerContext(db, user.id),
  ]);
  const existing = existingResult.rows[0];
  if (!existing) {
    return NextResponse.json({ error: 'Không tìm thấy tài khoản.' }, { status: 404 });
  }

  const updates: string[] = [];
  const args: Array<string | number> = [];

  if (parsed.data.name !== undefined) {
    updates.push('name = ?');
    args.push(parsed.data.name);
  }

  if (parsed.data.completeOnboarding) {
    updates.push("onboarded_at = COALESCE(onboarded_at, datetime('now'))");
  }

  if (parsed.data.newPassword !== undefined) {
    if (user.isDevelopmentUser) {
      return NextResponse.json(
        { error: 'Không thể đổi mật khẩu ở chế độ local development.' },
        { status: 400 },
      );
    }

    const currentHash = existing.password_hash ? String(existing.password_hash) : '';
    if (currentHash) {
      if (!parsed.data.currentPassword || !(await verifyPassword(parsed.data.currentPassword, currentHash))) {
        return NextResponse.json({ error: 'Mật khẩu hiện tại không đúng.' }, { status: 400 });
      }
    }

    const nextHash = await hashPassword(parsed.data.newPassword);
    updates.push('password_hash = ?');
    args.push(nextHash);
  }

  if (updates.length) {
    updates.push("updated_at = datetime('now')");
    args.push(user.id);
    await db.execute({
      sql: `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      args,
    });
  }

  let nextPersonas: PersonaId[] = ctx.personas;
  let nextPrimaryPersona: PersonaId = ctx.primaryPersona;
  let nextModules: EnabledModules = ctx.modules;
  let profileChanged = false;

  if (parsed.data.personas) {
    const valid = parsed.data.personas.filter(isPersonaId);
    if (!valid.length) {
      return NextResponse.json({ error: 'Loại hồ sơ không hợp lệ.' }, { status: 400 });
    }
    nextPersonas = valid;
    nextPrimaryPersona = isPersonaId(parsed.data.primaryPersona) && valid.includes(parsed.data.primaryPersona)
      ? parsed.data.primaryPersona
      : valid[0];
    nextModules = resolveModulesForPersonas(nextPersonas);
    profileChanged = true;
  } else if (isPersonaId(parsed.data.primaryPersona)) {
    nextPrimaryPersona = parsed.data.primaryPersona;
    if (!nextPersonas.includes(nextPrimaryPersona)) {
      nextPersonas = [nextPrimaryPersona, ...nextPersonas];
    }
    profileChanged = true;
  }

  if (parsed.data.enabledModules) {
    const merged: EnabledModules = { ...nextModules };
    for (const key of ALL_MODULE_KEYS) {
      if (typeof parsed.data.enabledModules[key] === 'boolean') {
        merged[key] = parsed.data.enabledModules[key];
      }
    }
    nextModules = merged;
    profileChanged = true;
  }

  if (profileChanged) {
    await db.execute({
      sql: `INSERT INTO user_profiles (user_id, primary_persona, personas_json, enabled_modules_json, active_ledger_id, updated_at)
            VALUES (?, ?, ?, ?, ?, datetime('now'))
            ON CONFLICT(user_id) DO UPDATE SET
              primary_persona = excluded.primary_persona,
              personas_json = excluded.personas_json,
              enabled_modules_json = excluded.enabled_modules_json,
              updated_at = datetime('now')`,
      args: [
        user.id,
        nextPrimaryPersona,
        JSON.stringify(nextPersonas),
        JSON.stringify(nextModules),
        ctx.ledgerId,
      ],
    });
  }

  return NextResponse.json({
    ok: true,
    hasPassword: parsed.data.newPassword ? true : Boolean(existing.password_hash),
    primaryPersona: nextPrimaryPersona,
    personas: nextPersonas,
    modules: nextModules,
  });
}
