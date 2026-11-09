import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/current-user';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: rawId } = await context.params;
  const providerId = Number(rawId);
  if (!Number.isInteger(providerId) || providerId <= 0) return NextResponse.json({ error: 'Provider không hợp lệ.' }, { status: 400 });
  try {
    const body: unknown = await request.json();
    if (!isRecord(body) || !Array.isArray(body.models) || body.models.length < 1 || body.models.length > 200) {
      return NextResponse.json({ error: 'Chọn từ 1 đến 200 model.' }, { status: 400 });
    }
    const db = await getDb();
    const provider = await db.execute({ sql: 'SELECT id FROM ai_providers WHERE id = ? AND user_id = ?', args: [providerId, user.id] });
    if (!provider.rows[0]) return NextResponse.json({ error: 'Không tìm thấy provider.' }, { status: 404 });
    const models = body.models.flatMap((raw, index) => {
      if (!isRecord(raw) || typeof raw.model_id !== 'string' || !raw.model_id.trim()) return [];
      return [{ modelId: raw.model_id.trim(), label: typeof raw.label === 'string' ? raw.label.trim() : '', position: index }];
    });
    if (!models.length) return NextResponse.json({ error: 'Không có model hợp lệ.' }, { status: 400 });
    await db.batch(models.map((model) => ({
      sql: `INSERT INTO ai_models (user_id, provider_id, model_id, label, position)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(provider_id, model_id) DO UPDATE SET
              label = excluded.label, enabled = 1, position = excluded.position`,
      args: [user.id, providerId, model.modelId, model.label, model.position],
    })), 'write');
    return NextResponse.json({ success: true, count: models.length });
  } catch (error) {
    console.error('[ai-provider-models]', error);
    return NextResponse.json({ error: 'Không thể lưu model.' }, { status: 500 });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
