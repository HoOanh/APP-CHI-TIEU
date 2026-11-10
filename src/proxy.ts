import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { isGoogleAuthConfigured } from '@/lib/current-user';

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublicRoute =
    pathname.startsWith('/login')
    || pathname.startsWith('/api/auth')
    || pathname === '/api/cron/pwa-reminders';

  if (isPublicRoute) {
    return NextResponse.next();
  }

  if (!isGoogleAuthConfigured()) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { error: 'Authentication is not configured' },
        { status: 503 },
      );
    }
    return NextResponse.next();
  }

  const session = await auth();
  if (!session) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/auth).*)'],
};
