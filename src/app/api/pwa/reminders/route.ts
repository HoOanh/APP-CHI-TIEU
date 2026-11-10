import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/current-user';
import { getDb } from '@/lib/db';

interface ReminderSettings {
  dailyEnabled: boolean;
  dailyTime: string;
  weeklyEnabled: boolean;
  weeklyDay: number;
  weeklyTime: string;
}

const DEFAULT_REMINDERS: ReminderSettings = {
  dailyEnabled: false,
  dailyTime: '21:00',
  weeklyEnabled: false,
  weeklyDay: 1,
  weeklyTime: '09:00',
};

function validTime(value: unknown): value is string {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function parseReminderSettings(value: unknown): ReminderSettings | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (
    typeof input.dailyEnabled !== 'boolean'
    || !validTime(input.dailyTime)
    || typeof input.weeklyEnabled !== 'boolean'
    || !Number.isInteger(input.weeklyDay)
    || Number(input.weeklyDay) < 1
    || Number(input.weeklyDay) > 7
    || !validTime(input.weeklyTime)
  ) return null;
  return {
    dailyEnabled: input.dailyEnabled,
    dailyTime: input.dailyTime,
    weeklyEnabled: input.weeklyEnabled,
    weeklyDay: Number(input.weeklyDay),
    weeklyTime: input.weeklyTime,
  };
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = await getDb();
  const result = await db.execute({
    sql: 'SELECT value FROM user_settings WHERE user_id = ? AND key = ?',
    args: [user.id, 'pwa_reminders'],
  });
  let reminders = DEFAULT_REMINDERS;
  const stored = result.rows[0]?.value;
  if (typeof stored === 'string') {
    try {
      reminders = parseReminderSettings(JSON.parse(stored)) || DEFAULT_REMINDERS;
    } catch {
      reminders = DEFAULT_REMINDERS;
    }
  }
  return NextResponse.json({ ...reminders, timezone: 'Asia/Ho_Chi_Minh' }, {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

export async function PUT(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body: unknown = await request.json().catch(() => null);
  const settings = parseReminderSettings(body);
  if (!settings) return NextResponse.json({ error: 'Lịch nhắc không hợp lệ.' }, { status: 400 });
  const db = await getDb();
  await db.execute({
    sql: `INSERT INTO user_settings (user_id, key, value)
          VALUES (?, 'pwa_reminders', ?)
          ON CONFLICT(user_id, key) DO UPDATE SET
            value = excluded.value,
            updated_at = datetime('now')`,
    args: [user.id, JSON.stringify(settings)],
  });
  return NextResponse.json({ ...settings, timezone: 'Asia/Ho_Chi_Minh' });
}
