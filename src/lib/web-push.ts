import 'server-only';

import { sendNotification, setVapidDetails, type PushSubscription } from 'web-push';
import { getDb } from '@/lib/db';

interface StoredSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PwaNotification {
  title: string;
  body: string;
  url: string;
  tag: string;
}

function getVapidKeys() {
  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey };
}

export function getWebPushPublicKey() {
  return getVapidKeys()?.publicKey || null;
}

function isValidPushEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint);
    if (url.protocol !== 'https:' || (url.port && url.port !== '443') || url.username || url.password) return false;
    const host = url.hostname.toLowerCase();
    return host === 'web.push.apple.com'
      || host === 'fcm.googleapis.com'
      || host === 'updates.push.services.mozilla.com'
      || host.endsWith('.push.services.mozilla.com')
      || host.endsWith('.notify.windows.com');
  } catch {
    return false;
  }
}

export async function sendPushToUser(userId: number, notification: PwaNotification) {
  const vapid = getVapidKeys();
  if (!vapid) return { sent: 0, removed: 0, configured: false };

  setVapidDetails(
    process.env.WEB_PUSH_VAPID_SUBJECT || 'mailto:admin@example.com',
    vapid.publicKey,
    vapid.privateKey,
  );

  const db = await getDb();
  const result = await db.execute({
    sql: 'SELECT endpoint, p256dh, auth FROM pwa_push_subscriptions WHERE user_id = ?',
    args: [userId],
  });

  let sent = 0;
  let removed = 0;
  await Promise.all(result.rows.map(async (row) => {
    const subscription: StoredSubscription = {
      endpoint: String(row.endpoint),
      p256dh: String(row.p256dh),
      auth: String(row.auth),
    };
    if (!isValidPushEndpoint(subscription.endpoint)) {
      await db.execute({
        sql: 'DELETE FROM pwa_push_subscriptions WHERE endpoint = ? AND user_id = ?',
        args: [subscription.endpoint, userId],
      });
      removed += 1;
      return;
    }

    try {
      await sendNotification({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      } satisfies PushSubscription, JSON.stringify(notification), {
        TTL: 60 * 60 * 12,
        urgency: 'normal',
      });
      sent += 1;
    } catch (error) {
      const statusCode = typeof error === 'object' && error !== null && 'statusCode' in error
        ? Number(error.statusCode)
        : 0;
      if (statusCode === 404 || statusCode === 410) {
        await db.execute({
          sql: 'DELETE FROM pwa_push_subscriptions WHERE endpoint = ? AND user_id = ?',
          args: [subscription.endpoint, userId],
        });
        removed += 1;
      } else {
        console.error('[web-push-send]', statusCode || 'unknown');
      }
    }
  }));

  return { sent, removed, configured: true };
}

export async function upsertPushSubscription({
  userId,
  endpoint,
  p256dh,
  auth,
}: {
  userId: number;
  endpoint: string;
  p256dh: string;
  auth: string;
}) {
  if (!isValidPushEndpoint(endpoint) || !/^[A-Za-z0-9_-]{20,512}$/.test(p256dh) || !/^[A-Za-z0-9_-]{8,256}$/.test(auth)) {
    throw new Error('Thông tin đăng ký notification không hợp lệ.');
  }

  const db = await getDb();
  await db.execute({
    sql: `INSERT INTO pwa_push_subscriptions (user_id, endpoint, p256dh, auth)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(endpoint) DO UPDATE SET
            user_id = excluded.user_id,
            p256dh = excluded.p256dh,
            auth = excluded.auth,
            updated_at = datetime('now')`,
    args: [userId, endpoint, p256dh, auth],
  });
}

export async function removePushSubscription(userId: number, endpoint: string) {
  const db = await getDb();
  await db.execute({
    sql: 'DELETE FROM pwa_push_subscriptions WHERE user_id = ? AND endpoint = ?',
    args: [userId, endpoint],
  });
}
