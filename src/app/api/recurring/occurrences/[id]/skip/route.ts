import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/current-user';
import { getDb } from '@/lib/db';
import { advanceDueDate } from '@/lib/reminders-worker';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'ID không hợp lệ.' }, { status: 400 });

  const db = await getDb();
  const occRes = await db.execute({
    sql: `SELECT o.id, o.rule_id, o.due_date, o.status, r.cadence, r.day_of_month
          FROM recurring_occurrences o
          JOIN recurring_rules r ON r.id = o.rule_id
          WHERE o.id = ? AND o.user_id = ? LIMIT 1`,
    args: [Number(id), user.id],
  });
  const occ = occRes.rows[0];
  if (!occ) return NextResponse.json({ error: 'Không tìm thấy nhắc hẹn.' }, { status: 404 });

  const cadence = (occ.cadence === 'weekly' || occ.cadence === 'yearly' ? occ.cadence : 'monthly') as
    | 'weekly'
    | 'monthly'
    | 'yearly';
  const nextDue = advanceDueDate(String(occ.due_date), cadence, Number(occ.day_of_month) || 1);

  await db.batch([
    {
      sql: "UPDATE recurring_occurrences SET status = 'skipped', resolved_at = datetime('now') WHERE id = ?",
      args: [Number(id)],
    },
    {
      sql: 'UPDATE recurring_rules SET next_due_date = ? WHERE id = ?',
      args: [nextDue, Number(occ.rule_id)],
    },
  ], 'write');

  return NextResponse.json({ ok: true, nextDueDate: nextDue });
}
