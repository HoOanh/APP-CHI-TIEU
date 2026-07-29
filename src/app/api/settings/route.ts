import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/current-user';
import { encryptSecret } from '@/lib/secrets';

const SECRET_SETTING_KEYS = new Set([
  'gemini_api_key',
  'gemini_api_key_2',
]);

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = await getDb();
    const result = await db.execute({
      sql: 'SELECT key, value FROM user_settings WHERE user_id = ?',
      args: [user.id],
    });
    
    const settingsObj = result.rows.reduce((acc, row) => {
      const key = String(row.key);
      acc[key] = SECRET_SETTING_KEYS.has(key)
        ? { configured: true }
        : String(row.value);
      return acc;
    }, {} as Record<string, string | { configured: boolean }>);

    const envKeyCount = [
      process.env.GEMINI_API_KEY,
      process.env.GEMINI_API_KEY_2,
    ].filter(Boolean).length;
    
    return NextResponse.json({
      settings: settingsObj,
      gemini: {
        configured:
          envKeyCount > 0 ||
          result.rows.some((row) => SECRET_SETTING_KEYS.has(String(row.key))),
        source:
          result.rows.some((row) => SECRET_SETTING_KEYS.has(String(row.key)))
            ? 'account'
            : envKeyCount > 0
              ? 'server'
              : 'none',
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { key, value } = await request.json();
    if (
      typeof key !== 'string' ||
      typeof value !== 'string' ||
      !SECRET_SETTING_KEYS.has(key) ||
      value.trim().length < 10
    ) {
      return NextResponse.json({ error: 'Invalid setting' }, { status: 400 });
    }
    
    const db = await getDb();
    await db.execute({
      sql: `
        INSERT INTO user_settings (user_id, key, value)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id, key) DO UPDATE SET
          value = excluded.value,
          updated_at = datetime('now')
      `,
      args: [user.id, key, encryptSecret(value.trim())]
    });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to update setting' }, { status: 500 });
  }
}
