import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/current-user';
import { getDb } from '@/lib/db';

const updateSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  amount: z.coerce.number().finite().positive().optional(),
  enabled: z.boolean().optional(),
  next_due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  remind_days_before: z.coerce.number().int().min(0).max(14).optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'ID không hợp lệ.' }, { status: 400 });

  const rawBody: unknown = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dữ liệu cập nhật không hợp lệ.' }, { status: 400 });
  }

  const db = await getDb();
  const res = await db.execute({
    sql: `UPDATE recurring_rules
          SET title = COALESCE(?, title),
              amount = COALESCE(?, amount),
              enabled = COALESCE(?, enabled),
              next_due_date = COALESCE(?, next_due_date),
              remind_days_before = COALESCE(?, remind_days_before)
          WHERE id = ? AND user_id = ?`,
    args: [
      parsed.data.title ?? null,
      parsed.data.amount ?? null,
      parsed.data.enabled === undefined ? null : parsed.data.enabled ? 1 : 0,
      parsed.data.next_due_date ?? null,
      parsed.data.remind_days_before ?? null,
      Number(id),
      user.id,
    ],
  });

  if (!res.rowsAffected) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'ID không hợp lệ.' }, { status: 400 });

  const db = await getDb();
  const res = await db.execute({
    sql: 'DELETE FROM recurring_rules WHERE id = ? AND user_id = ?',
    args: [Number(id), user.id],
  });
  if (!res.rowsAffected) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
