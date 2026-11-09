import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/current-user';

type RouteContext = { params: Promise<{ id: string; modelId: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: rawProviderId, modelId: rawModelId } = await context.params;
  const providerId = Number(rawProviderId);
  const modelId = Number(rawModelId);
  if (!Number.isInteger(providerId) || !Number.isInteger(modelId) || providerId <= 0 || modelId <= 0) {
    return NextResponse.json({ error: 'Model không hợp lệ.' }, { status: 400 });
  }
  const body: unknown = await request.json();
  if (!isRecord(body) || typeof body.enabled !== 'boolean') {
    return NextResponse.json({ error: 'Cần trạng thái model hợp lệ.' }, { status: 400 });
  }
  const db = await getDb();
  const model = await db.execute({
    sql: 'SELECT model_id FROM ai_models WHERE id = ? AND provider_id = ? AND user_id = ?',
    args: [modelId, providerId, user.id],
  });
  if (!model.rows[0]) return NextResponse.json({ error: 'Không tìm thấy model.' }, { status: 404 });
  if (!body.enabled) {
    await db.execute({
      sql: "UPDATE ai_providers SET default_model_id = '' WHERE id = ? AND user_id = ? AND default_model_id = ?",
      args: [providerId, user.id, model.rows[0].model_id],
    });
  }
  await db.execute({ sql: 'UPDATE ai_models SET enabled = ? WHERE id = ? AND provider_id = ? AND user_id = ?', args: [body.enabled ? 1 : 0, modelId, providerId, user.id] });
  return NextResponse.json({ success: true });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: rawProviderId, modelId: rawModelId } = await context.params;
  const providerId = Number(rawProviderId);
  const modelId = Number(rawModelId);
  if (!Number.isInteger(providerId) || !Number.isInteger(modelId) || providerId <= 0 || modelId <= 0) {
    return NextResponse.json({ error: 'Model không hợp lệ.' }, { status: 400 });
  }
  const db = await getDb();
  const result = await db.execute({ sql: 'SELECT model_id FROM ai_models WHERE id = ? AND provider_id = ? AND user_id = ?', args: [modelId, providerId, user.id] });
  const model = result.rows[0];
  if (!model) return NextResponse.json({ error: 'Không tìm thấy model.' }, { status: 404 });
  if (model.model_id) {
    await db.execute({ sql: "UPDATE ai_providers SET default_model_id = '' WHERE id = ? AND user_id = ? AND default_model_id = ?", args: [providerId, user.id, model.model_id] });
  }
  await db.execute({ sql: 'DELETE FROM ai_models WHERE id = ? AND provider_id = ? AND user_id = ?', args: [modelId, providerId, user.id] });
  return NextResponse.json({ success: true });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
