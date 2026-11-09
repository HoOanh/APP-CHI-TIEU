import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/current-user';
import { encryptSecret } from '@/lib/secrets';
import {
  getProviderPresets,
  getUserProviders,
  normalizeProviderUrl,
  type AiProtocol,
} from '@/lib/ai-provider';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = await getDb();
  const legacy = await db.execute({ sql: "SELECT 1 FROM user_settings WHERE user_id = ? AND key IN ('gemini_api_key', 'gemini_api_key_2') LIMIT 1", args: [user.id] });
  const serverFallback = Boolean(process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY_2);
  return NextResponse.json({
    providers: await getUserProviders(user.id),
    presets: getProviderPresets(),
    fallbackAvailable: Boolean(legacy.rows.length || serverFallback),
    fallbackSource: legacy.rows.length ? 'account' : serverFallback ? 'server' : 'none',
  });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body: unknown = await request.json();
    if (!isRecord(body)) return NextResponse.json({ error: 'Dữ liệu provider không hợp lệ.' }, { status: 400 });
    const protocol = body.protocol;
    const label = typeof body.label === 'string' ? body.label.trim() : '';
    const baseUrl = typeof body.base_url === 'string' ? body.base_url : '';
    const apiKey = typeof body.api_key === 'string' ? body.api_key.trim() : '';
    if (!label || (protocol !== 'gemini' && protocol !== 'openai_compatible') || apiKey.length < 8) {
      return NextResponse.json({ error: 'Cần tên, provider hợp lệ và API key.' }, { status: 400 });
    }
    const normalizedUrl = normalizeProviderUrl(baseUrl, protocol);
    const db = await getDb();
    const secretHint = `••••${apiKey.slice(-4)}`;
    const result = await db.execute({
      sql: `INSERT INTO ai_providers (user_id, label, protocol, base_url, secret_encrypted, secret_hint, enabled)
            VALUES (?, ?, ?, ?, ?, ?, 0)`,
      args: [user.id, label, protocol, normalizedUrl, encryptSecret(apiKey), secretHint],
    });
    return NextResponse.json({ id: Number(result.lastInsertRowid), success: true }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Không thể thêm provider.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
