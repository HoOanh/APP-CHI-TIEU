import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/current-user';
import { encryptSecret } from '@/lib/secrets';
import { normalizeProviderUrl, type AiProtocol } from '@/lib/ai-provider';

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: rawId } = await context.params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Provider không hợp lệ.' }, { status: 400 });
  try {
    const body: unknown = await request.json();
    if (!isRecord(body)) return NextResponse.json({ error: 'Dữ liệu không hợp lệ.' }, { status: 400 });
    const db = await getDb();
    const current = await db.execute({
      sql: 'SELECT protocol, base_url FROM ai_providers WHERE id = ? AND user_id = ?',
      args: [id, user.id],
    });
    const provider = current.rows[0];
    if (!provider) return NextResponse.json({ error: 'Không tìm thấy provider.' }, { status: 404 });
    if (typeof body.default_model_id === 'string') {
      const model = await db.execute({
        sql: 'SELECT id FROM ai_models WHERE user_id = ? AND provider_id = ? AND model_id = ? AND enabled = 1',
        args: [user.id, id, body.default_model_id],
      });
      if (!model.rows[0]) return NextResponse.json({ error: 'Model mặc định không hợp lệ.' }, { status: 400 });
      await db.execute({
        sql: "UPDATE ai_providers SET default_model_id = ?, enabled = 1, updated_at = datetime('now') WHERE id = ? AND user_id = ?",
        args: [body.default_model_id, id, user.id],
      });
      await db.execute({ sql: 'UPDATE ai_providers SET enabled = 0 WHERE user_id = ? AND id <> ?', args: [user.id, id] });
    }
    if (typeof body.enabled === 'boolean') {
      if (body.enabled) {
        await db.execute({ sql: 'UPDATE ai_providers SET enabled = 0 WHERE user_id = ? AND id <> ?', args: [user.id, id] });
      }
      await db.execute({
        sql: "UPDATE ai_providers SET enabled = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?",
        args: [body.enabled ? 1 : 0, id, user.id],
      });
    }
    if (typeof body.label === 'string' || typeof body.base_url === 'string' || typeof body.api_key === 'string') {
      const label = typeof body.label === 'string' ? body.label.trim() : undefined;
      const baseUrl = typeof body.base_url === 'string'
        ? normalizeProviderUrl(body.base_url, provider.protocol as AiProtocol)
        : undefined;
      const apiKey = typeof body.api_key === 'string' ? body.api_key.trim() : '';
      if (label !== undefined && !label) return NextResponse.json({ error: 'Tên provider không được để trống.' }, { status: 400 });
      if (apiKey && apiKey.length < 8) return NextResponse.json({ error: 'API key không hợp lệ.' }, { status: 400 });
      const updates: string[] = [];
      const args: Array<string | number> = [];
      if (label !== undefined) { updates.push('label = ?'); args.push(label); }
      if (baseUrl !== undefined) { updates.push('base_url = ?'); args.push(baseUrl); }
      if (apiKey) { updates.push('secret_encrypted = ?', 'secret_hint = ?'); args.push(encryptSecret(apiKey), `••••${apiKey.slice(-4)}`); }
      if (updates.length) {
        updates.push("updated_at = datetime('now')");
        args.push(id, user.id);
        await db.execute({ sql: `UPDATE ai_providers SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`, args });
      }
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Không thể cập nhật provider.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: rawId } = await context.params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Provider không hợp lệ.' }, { status: 400 });
  const db = await getDb();
  await db.execute({ sql: 'DELETE FROM ai_models WHERE provider_id = ? AND user_id = ?', args: [id, user.id] });
  await db.execute({ sql: 'DELETE FROM ai_providers WHERE id = ? AND user_id = ?', args: [id, user.id] });
  return NextResponse.json({ success: true });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
