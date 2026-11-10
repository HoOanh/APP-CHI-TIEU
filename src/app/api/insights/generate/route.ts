import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/current-user';
import { generateWeeklyInsight } from '@/lib/insights';

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    return NextResponse.json(await generateWeeklyInsight(user.id));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Không thể tạo bản phân tích.';
    console.error('[insights-generate]', error);
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
