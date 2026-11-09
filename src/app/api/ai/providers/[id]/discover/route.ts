import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/current-user';
import { discoverProviderModels, getProviderSecret, type AiProtocol } from '@/lib/ai-provider';
import { getDb } from '@/lib/db';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: rawId } = await context.params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Provider không hợp lệ.' }, { status: 400 });
  try {
    const db = await getDb();
    const result = await db.execute({ sql: 'SELECT protocol, base_url FROM ai_providers WHERE id = ? AND user_id = ?', args: [id, user.id] });
    const provider = result.rows[0];
    if (!provider) return NextResponse.json({ error: 'Không tìm thấy provider.' }, { status: 404 });
    const apiKey = await getProviderSecret(user.id, id);
    if (!apiKey) return NextResponse.json({ error: 'Chưa có API key.' }, { status: 400 });
    const models = await discoverProviderModels(provider.protocol as AiProtocol, String(provider.base_url), apiKey);
    return NextResponse.json({ models });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Không thể tải danh sách model.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
