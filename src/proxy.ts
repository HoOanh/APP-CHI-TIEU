import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { isGoogleAuthConfigured } from '@/lib/current-user';

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublicRoute =
    pathname.startsWith('/login')
    || pathname.startsWith('/reset-password')
    || pathname.startsWith('/api/auth')
    || pathname === '/api/cron/pwa-reminders';

  if (isPublicRoute) {
    return NextResponse.next();
  }

  if (
    !isGoogleAuthConfigured()
    && process.env.NODE_ENV !== 'production'
    && process.env.ALLOW_LOCAL_DEV_BYPASS !== 'false'
  ) {
    return NextResponse.next();
  }

  const session = await auth();
  if (!session) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const login = new URL('/login', request.url);
    if (pathname === '/chat') login.searchParams.set('redirectTo', '/chat');
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico$|sw\\.js$|offline\\.html$|(?:manifest|ghi-nhanh)\\.webmanifest$|ghi-nhanh\\.webloc$|arc-irobot\\.png$|pwa-icon\\.svg$|icon\\.png$|api/auth).*)'],
};
