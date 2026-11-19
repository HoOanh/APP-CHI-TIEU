import { NextRequest, NextResponse } from 'next/server';
import {
  MAX_CHAT_IMAGES,
  MAX_CHAT_IMAGE_BYTES,
  processChatSubmission,
  type ChatImagePayload,
} from '@/lib/chat-pipeline';
import { getDb } from '@/lib/db';
import { authenticateShortcutBearer } from '@/lib/shortcut-auth';
import { formatCurrency } from '@/lib/utils';

export async function POST(request: NextRequest) {
  try {
    const db = await getDb();
    const auth = await authenticateShortcutBearer(db, request.headers.get('authorization'));
    if (!auth) {
      return NextResponse.json({ ok: false, error: 'Unauthorized shortcut key' }, { status: 401 });
    }

    const contentType = request.headers.get('content-type') || '';
    let message = '';
    let accountId: number | null = auth.defaultAccountId;
    let requestId: string | null = null;
    let images: ChatImagePayload[] = [];

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const rawFiles = formData
        .getAll('images')
        .concat(formData.getAll('image'))
        .filter((item): item is File => item instanceof File && item.size > 0);
      if (rawFiles.length > MAX_CHAT_IMAGES) {
        return NextResponse.json({ ok: false, error: `Tối đa ${MAX_CHAT_IMAGES} ảnh.` }, { status: 413 });
      }
      if (rawFiles.some((f) => f.size > MAX_CHAT_IMAGE_BYTES)) {
        return NextResponse.json({ ok: false, error: 'Ảnh vượt quá 5MB.' }, { status: 413 });
      }
      images = await Promise.all(
        rawFiles.map(async (f) => ({
          base64Data: Buffer.from(await f.arrayBuffer()).toString('base64'),
          mimeType: f.type || 'image/jpeg',
          size: f.size,
        })),
      );
      const rawMessage = formData.get('message') ?? formData.get('text');
      message = typeof rawMessage === 'string' ? rawMessage.trim() : '';
      const rawAccount = formData.get('account_id');
      if (typeof rawAccount === 'string' && /^\d+$/.test(rawAccount)) {
        accountId = Number(rawAccount);
      }
      const rawReq = formData.get('client_request_id');
      if (typeof rawReq === 'string' && rawReq.trim()) {
        requestId = rawReq.trim();
      }
    } else {
      const body = await request.json().catch(() => null) as Record<string, unknown> | null;
      if (!body) {
        return NextResponse.json({ ok: false, error: 'Dữ liệu JSON không hợp lệ.' }, { status: 400 });
      }
      const rawText = typeof body.text === 'string'
        ? body.text.trim()
        : typeof body.message === 'string'
          ? body.message.trim()
          : '';
      const rawAmount = typeof body.amount === 'number' || typeof body.amount === 'string'
        ? Number(body.amount)
        : 0;
      const rawDesc = typeof body.description === 'string' ? body.description.trim() : '';
      message = rawText || (rawDesc && rawAmount > 0 ? `${rawDesc} ${Math.round(rawAmount)}đ` : '');
      if (typeof body.account_id === 'number' && Number.isInteger(body.account_id) && body.account_id > 0) {
        accountId = body.account_id;
      }
      if (typeof body.client_request_id === 'string' && body.client_request_id.trim()) {
        requestId = body.client_request_id.trim();
      }
    }

    if (!requestId) {
      requestId = `sc_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    }

    const result = await processChatSubmission({
      db,
      userId: auth.userId,
      message,
      images,
      mode: 'auto',
      accountId,
      requestId,
      source: 'shortcut',
    });

    if (result.status >= 400) {
      return NextResponse.json(
        { ok: false, error: result.body.error || 'Không thể xử lý giao dịch.' },
        { status: result.status, headers: result.headers },
      );
    }

    let summaryText = result.body.answer || result.body.message || 'Đã ghi nhận giao dịch.';
    const txs = (result.body.transactions ?? []) as Array<{
      amount?: number;
      description?: string;
      category_name?: string | null;
    }>;
    if (txs.length === 1) {
      const first = txs[0];
      summaryText = `Đã ghi ${formatCurrency(Number(first.amount) || 0)} · ${first.description || 'Giao dịch'}${first.category_name ? ` (${first.category_name})` : ''}`;
    } else if (txs.length > 1) {
      summaryText = `Đã ghi ${txs.length} giao dịch qua Phím tắt.`;
    }

    return NextResponse.json(
      {
        ok: true,
        summaryText,
        ...result.body,
      },
      { status: result.status },
    );
  } catch (error) {
    console.error('[api/shortcuts/transactions]', error);
    return NextResponse.json({ ok: false, error: 'Lỗi máy chủ khi xử lý Shortcut.' }, { status: 500 });
  }
}
