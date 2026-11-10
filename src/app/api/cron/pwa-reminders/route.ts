import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { generateWeeklyInsight, getLatestWeeklyInsight } from '@/lib/insights';
import { sendPushToUser } from '@/lib/web-push';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface ReminderSettings {
  dailyEnabled: boolean;
  dailyTime: string;
  weeklyEnabled: boolean;
  weeklyDay: number;
  weeklyTime: string;
}

interface ReminderUser {
  user_id: number;
  value: string;
}

const TIMEZONE = 'Asia/Ho_Chi_Minh';
const DELIVERY_GRACE_MINUTES = 10;

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get('authorization') || '';
  const expected = secret ? `Bearer ${secret}` : '';
  if (!expected || authorization.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(authorization), Buffer.from(expected));
}

function parseSettings(value: string): ReminderSettings | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    const validTime = (time: unknown): time is string => typeof time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
    if (
      typeof record.dailyEnabled !== 'boolean'
      || !validTime(record.dailyTime)
      || typeof record.weeklyEnabled !== 'boolean'
      || !Number.isInteger(record.weeklyDay)
      || Number(record.weeklyDay) < 1
      || Number(record.weeklyDay) > 7
      || !validTime(record.weeklyTime)
    ) return null;
    return {
      dailyEnabled: record.dailyEnabled,
      dailyTime: record.dailyTime,
      weeklyEnabled: record.weeklyEnabled,
      weeklyDay: Number(record.weeklyDay),
      weeklyTime: record.weeklyTime,
    };
  } catch {
    return null;
  }
}

function getLocalClock(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || '';
  const year = Number(part('year'));
  const month = Number(part('month'));
  const day = Number(part('day'));
  const hour = Number(part('hour'));
  const minute = Number(part('minute'));
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay() || 7;
  return {
    dateKey: `${part('year')}-${part('month')}-${part('day')}`,
    weekday,
    minuteOfDay: hour * 60 + minute,
  };
}

function isDue(now: { minuteOfDay: number }, configuredTime: string) {
  const [hour, minute] = configuredTime.split(':').map(Number);
  const elapsed = now.minuteOfDay - (hour * 60 + minute);
  return elapsed >= 0 && elapsed <= DELIVERY_GRACE_MINUTES;
}

async function deliverOnce({
  userId,
  kind,
  occurrenceKey,
  title,
  body,
  url,
}: {
  userId: number;
  kind: string;
  occurrenceKey: string;
  title: string;
  body: string;
  url: string;
}) {
  const db = await getDb();
  await db.execute({
    sql: `INSERT OR IGNORE INTO notification_deliveries (user_id, kind, occurrence_key)
          VALUES (?, ?, ?)`,
    args: [userId, kind, occurrenceKey],
  });
  const delivery = await db.execute({
    sql: `SELECT status FROM notification_deliveries
          WHERE user_id = ? AND kind = ? AND occurrence_key = ?`,
    args: [userId, kind, occurrenceKey],
  });
  if (String(delivery.rows[0]?.status) === 'sent') return 'already-sent';

  try {
    const result = await sendPushToUser(userId, { title, body, url, tag: `${kind}-${occurrenceKey}` });
    if (result.sent > 0) {
      await db.execute({
        sql: `UPDATE notification_deliveries SET status = 'sent', sent_at = datetime('now'), last_error = ''
              WHERE user_id = ? AND kind = ? AND occurrence_key = ?`,
        args: [userId, kind, occurrenceKey],
      });
      return 'sent';
    }
    const error = result.configured ? 'Thiết bị chưa đăng ký nhận thông báo.' : 'Máy chủ chưa cấu hình Web Push.';
    await db.execute({
      sql: `UPDATE notification_deliveries SET status = 'pending', last_error = ?
            WHERE user_id = ? AND kind = ? AND occurrence_key = ?`,
      args: [error, userId, kind, occurrenceKey],
    });
    return 'pending';
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 300) : 'Gửi thông báo thất bại.';
    await db.execute({
      sql: `UPDATE notification_deliveries SET status = 'pending', last_error = ?
            WHERE user_id = ? AND kind = ? AND occurrence_key = ?`,
      args: [message, userId, kind, occurrenceKey],
    });
    return 'pending';
  }
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const now = getLocalClock(new Date());
  const db = await getDb();
  const result = await db.execute({
    sql: `SELECT user_id, value FROM user_settings WHERE key = 'pwa_reminders'`,
  });
  const counts = { sent: 0, pending: 0, skipped: 0 };

  for (const row of result.rows) {
    const user: ReminderUser = { user_id: Number(row.user_id), value: String(row.value) };
    const settings = parseSettings(user.value);
    if (!settings) continue;

    if (settings.dailyEnabled && isDue(now, settings.dailyTime)) {
      const outcome = await deliverOnce({
        userId: user.user_id,
        kind: 'daily-reminder',
        occurrenceKey: now.dateKey,
        title: 'Ghi chú nhanh cho hôm nay',
        body: 'Có khoản chi hoặc thu nào ĐẠI CA muốn ghi lại không?',
        url: '/chat?source=daily-reminder',
      });
      counts[outcome === 'already-sent' ? 'skipped' : outcome] += 1;
    }

    if (settings.weeklyEnabled && now.weekday === settings.weeklyDay && isDue(now, settings.weeklyTime)) {
      const occurrenceKey = now.dateKey;
      try {
        const latest = await getLatestWeeklyInsight(user.user_id);
        if (!latest || latest.period_end !== now.dateKey) await generateWeeklyInsight(user.user_id);
        const outcome = await deliverOnce({
          userId: user.user_id,
          kind: 'weekly-insight',
          occurrenceKey,
          title: 'Bản phân tích tài chính tuần đã sẵn sàng',
          body: 'Mở ARC Irobot để xem xu hướng và gợi ý từ AI.',
          url: '/',
        });
        counts[outcome === 'already-sent' ? 'skipped' : outcome] += 1;
      } catch (error) {
        console.error('[weekly-insight-cron]', user.user_id, error);
        counts.pending += 1;
      }
    }
  }

  return NextResponse.json({ ok: true, timezone: TIMEZONE, checked: result.rows.length, ...counts });
}
