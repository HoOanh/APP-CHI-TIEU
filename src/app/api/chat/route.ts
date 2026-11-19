import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/current-user';
import { getDb } from '@/lib/db';
import {
  MAX_CHAT_IMAGES,
  MAX_CHAT_IMAGE_BYTES,
  processChatSubmission,
  type ChatImagePayload,
} from '@/lib/chat-pipeline';
import type { PendingTransactionForCorrection } from '@/lib/gemini';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const rawFiles = formData
      .getAll('images')
      .concat(formData.getAll('image'))
      .filter((item): item is File => item instanceof File && item.size > 0);

    if (rawFiles.length > MAX_CHAT_IMAGES) {
      return NextResponse.json(
        { error: `Tối đa ${MAX_CHAT_IMAGES} ảnh mỗi lần gửi.` },
        { status: 413 },
      );
    }
    if (rawFiles.some((file) => file.size > MAX_CHAT_IMAGE_BYTES)) {
      return NextResponse.json(
        { error: 'Mỗi ảnh không được vượt quá 5MB.' },
        { status: 413 },
      );
    }

    const images: ChatImagePayload[] = await Promise.all(
      rawFiles.map(async (file) => ({
        base64Data: Buffer.from(await file.arrayBuffer()).toString('base64'),
        mimeType: file.type || 'image/jpeg',
        size: file.size,
      })),
    );

    const messageInput = formData.get('message');
    const message = typeof messageInput === 'string' ? messageInput.trim() : '';
    const modeField = formData.get('mode') ?? formData.get('type');
    const mode = modeField === 'debt' ? 'debt' : modeField === 'expense' ? 'auto' : 'auto';
    const requestIdField = formData.get('client_request_id');
    const requestId = typeof requestIdField === 'string' ? requestIdField : null;
    const accountIdField = formData.get('account_id');
    const accountId = typeof accountIdField === 'string' && /^\d+$/.test(accountIdField)
      ? Number(accountIdField)
      : null;
    const correctionContext = requestId ? [] : parseCorrectionContext(formData.get('correction_context'));

    const db = await getDb();
    const result = await processChatSubmission({
      db,
      userId: user.id,
      userName: user.name,
      message,
      images,
      mode,
      accountId,
      requestId,
      correctionContext,
      source: 'chat',
    });

    return NextResponse.json(result.body, {
      status: result.status,
      headers: result.headers,
    });
  } catch (error) {
    console.error('[api/chat]', error);
    return NextResponse.json({ error: 'Không thể xử lý giao dịch. Vui lòng thử lại.' }, { status: 500 });
  }
}

function parseCorrectionContext(value: FormDataEntryValue | null): PendingTransactionForCorrection[] {
  if (typeof value !== 'string') return [];

  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];

    return parsed.flatMap((item): PendingTransactionForCorrection[] => {
      if (!item || typeof item !== 'object') return [];
      const transaction = item as Record<string, unknown>;
      const amount = Number(transaction.amount);
      const type = transaction.type === 'income' ? 'income' : 'expense';
      const description = typeof transaction.description === 'string' ? transaction.description : '';
      const category = typeof transaction.category === 'string' ? transaction.category : '';
      const date = typeof transaction.date === 'string' ? transaction.date : '';

      if (!Number.isFinite(amount) || amount <= 0 || !description || !category || !date) return [];
      return [{
        amount,
        description,
        category,
        merchant: typeof transaction.merchant === 'string' ? transaction.merchant : '',
        date,
        type,
      }];
    });
  } catch {
    return [];
  }
}
