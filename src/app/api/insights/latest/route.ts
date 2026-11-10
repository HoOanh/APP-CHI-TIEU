import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/current-user';
import { getLatestWeeklyInsight } from '@/lib/insights';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    return NextResponse.json(await getLatestWeeklyInsight(user.id), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    console.error('[insights-latest]', error);
    return NextResponse.json({ error: 'Không thể tải bản phân tích.' }, { status: 500 });
  }
}
