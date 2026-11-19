import type { Client } from '@libsql/client';
import { formatCurrency, getVietnamToday } from './utils.ts';

export type PushSender = (
  userId: number,
  payload: { title: string; body: string; url: string; tag: string },
) => Promise<{ sent: number }>;

export function advanceDueDate(currentDueDate: string, cadence: 'weekly' | 'monthly' | 'yearly', dayOfMonth = 1): string {
  const parts = currentDueDate.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isInteger(n))) return getVietnamToday();
  const [y, m, d] = parts;

  if (cadence === 'weekly') {
    const dt = new Date(Date.UTC(y, m - 1, d + 7));
    return dt.toISOString().slice(0, 10);
  }
  if (cadence === 'yearly') {
    const nextYear = y + 1;
    const maxDay = new Date(Date.UTC(nextYear, m, 0)).getUTCDate();
    return `${nextYear}-${String(m).padStart(2, '0')}-${String(Math.min(d, maxDay)).padStart(2, '0')}`;
  }
  // monthly
  const targetDay = Math.min(28, Math.max(1, dayOfMonth || d));
  const nextMonthDate = new Date(Date.UTC(y, m, 1));
  const ny = nextMonthDate.getUTCFullYear();
  const nm = nextMonthDate.getUTCMonth() + 1;
  const maxDay = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${String(nm).padStart(2, '0')}-${String(Math.min(targetDay, maxDay)).padStart(2, '0')}`;
}

export async function materializeDueOccurrences(db: Client, userId?: number) {
  const today = getVietnamToday();
  const res = await db.execute({
    sql: `SELECT id, user_id, title, amount, cadence, day_of_month, next_due_date, remind_days_before
          FROM recurring_rules
          WHERE enabled = 1
            ${userId ? 'AND user_id = ?' : ''}
            AND date(next_due_date, '-' || COALESCE(remind_days_before, 0) || ' days') <= ?`,
    args: userId ? [userId, today] : [today],
  });

  if (res.rows.length === 0) return [];

  const created: Array<{ ruleId: number; userId: number; title: string; amount: number; dueDate: string }> = [];
  for (const row of res.rows) {
    const ruleId = Number(row.id);
    const ownerId = Number(row.user_id);
    const dueDate = String(row.next_due_date);

    const ins = await db.execute({
      sql: `INSERT INTO recurring_occurrences (rule_id, user_id, due_date, status)
            VALUES (?, ?, ?, 'pending')
            ON CONFLICT(rule_id, due_date) DO NOTHING`,
      args: [ruleId, ownerId, dueDate],
    });
    if (ins.rowsAffected > 0) {
      created.push({
        ruleId,
        userId: ownerId,
        title: String(row.title),
        amount: Number(row.amount) || 0,
        dueDate,
      });
    }
  }
  return created;
}

export async function processRecurringReminderPushes(db: Client, sendPush: PushSender) {
  await materializeDueOccurrences(db);

  const pendingRes = await db.execute({
    sql: `SELECT o.id AS occ_id, o.user_id, o.due_date, r.title, r.amount
          FROM recurring_occurrences o
          JOIN recurring_rules r ON r.id = o.rule_id
          WHERE o.status = 'pending' AND o.notified_at IS NULL AND r.enabled = 1
          ORDER BY o.due_date ASC
          LIMIT 50`,
  });

  const rows = pendingRes.rows;
  let sent = 0;
  let failed = 0;

  // Bounded concurrency of 5 per batch
  const CHUNK_SIZE = 5;
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    await Promise.all(
      chunk.map(async (row) => {
        const occId = Number(row.occ_id);
        const ownerId = Number(row.user_id);
        const title = String(row.title);
        const amount = Number(row.amount) || 0;
        try {
          const pushResult = await sendPush(ownerId, {
            title: `Nhắc hẹn chi tiêu: ${title}`,
            body: `Đến hạn ${String(row.due_date)} · Dự kiến ${formatCurrency(amount)}. Mở app để xác nhận ghi sổ!`,
            url: '/?recurring=pending',
            tag: `recurring-${occId}`,
          });
          if (pushResult.sent > 0) {
            await db.execute({
              sql: "UPDATE recurring_occurrences SET notified_at = datetime('now') WHERE id = ?",
              args: [occId],
            });
            sent += 1;
          }
        } catch {
          failed += 1;
        }
      }),
    );
  }

  return { checked: rows.length, sent, failed };
}
