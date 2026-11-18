import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/current-user';
import { transcribeAudio } from '@/lib/gemini';

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const audio = formData.get('audio');
    if (!(audio instanceof File) || audio.size === 0) {
      return NextResponse.json({ text: '' });
    }
    if (audio.size > MAX_AUDIO_BYTES) {
      return NextResponse.json(
        { error: 'Đoạn ghi âm quá dài. Hãy nói ngắn gọn hơn.' },
        { status: 413 },
      );
    }

    const buffer = Buffer.from(await audio.arrayBuffer());
    const base64Data = buffer.toString('base64');
    const mimeType = audio.type || 'audio/webm';

    const text = await transcribeAudio(base64Data, mimeType, user.id);
    return NextResponse.json({ text });
  } catch (error) {
    console.error('[chat/transcribe]', error);
    return NextResponse.json(
      { error: 'Không thể nhận diện giọng nói lúc này. Vui lòng thử lại.' },
      { status: 500 },
    );
  }
}
