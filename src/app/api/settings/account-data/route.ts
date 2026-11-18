import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/current-user';
import { getDb } from '@/lib/db';
import { resetAccountData } from '@/lib/reset-account-data';

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || !('confirmation' in body) || body.confirmation !== 'XÓA') {
    return NextResponse.json({ error: 'Xác nhận xóa dữ liệu không hợp lệ.' }, { status: 400 });
  }

  try {
    await resetAccountData(await getDb(), user.id);
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error('[reset-account-data]', error);
    return NextResponse.json({ error: 'Không thể xóa dữ liệu tài khoản.' }, { status: 500 });
  }
}
