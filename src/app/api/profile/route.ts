import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/current-user';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  return NextResponse.json({
    name: user.name,
    email: user.email,
    image: user.image,
    isDevelopmentUser: user.isDevelopmentUser,
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
