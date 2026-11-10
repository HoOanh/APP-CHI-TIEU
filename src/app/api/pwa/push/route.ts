import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/current-user';
import { getDb } from '@/lib/db';
import { getWebPushPublicKey, removePushSubscription, upsertPushSubscription } from '@/lib/web-push';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = await getDb();
  const result = await db.execute({
    sql: 'SELECT COUNT(*) AS count FROM pwa_push_subscriptions WHERE user_id = ?',
    args: [user.id],
  });
  return NextResponse.json({
    configured: Boolean(getWebPushPublicKey()),
    publicKey: getWebPushPublicKey(),
    subscribed: Number(result.rows[0]?.count || 0) > 0,
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!getWebPushPublicKey()) {
    return NextResponse.json({ error: 'Web Push chưa được cấu hình trên máy chủ.' }, { status: 503 });
  }

  try {
    const body: unknown = await request.json();
    if (!isRecord(body) || !isRecord(body.keys)) {
      return NextResponse.json({ error: 'Subscription không hợp lệ.' }, { status: 400 });
    }
    const { endpoint } = body;
    const { p256dh, auth } = body.keys;
    if (typeof endpoint !== 'string' || typeof p256dh !== 'string' || typeof auth !== 'string') {
      return NextResponse.json({ error: 'Subscription không hợp lệ.' }, { status: 400 });
    }
    await upsertPushSubscription({ userId: user.id, endpoint, p256dh, auth });
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Không thể bật notification.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body: unknown = await request.json().catch(() => null);
  if (!isRecord(body) || typeof body.endpoint !== 'string') {
    return NextResponse.json({ error: 'Subscription không hợp lệ.' }, { status: 400 });
  }
  await removePushSubscription(user.id, body.endpoint);
  return NextResponse.json({ success: true });
}
