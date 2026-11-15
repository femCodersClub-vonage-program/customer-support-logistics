import { NextResponse } from 'next/server';

import { safeNextPath } from './lib/next-path';
import { CURRENT_PATH_HEADER, LOGIN_PATH, SESSION_COOKIE } from './lib/session';

import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const signedIn = request.cookies.has(SESSION_COOKIE);
  const onLogin = request.nextUrl.pathname === LOGIN_PATH;

  if (onLogin) {
    return signedIn
      ? NextResponse.redirect(
          new URL(safeNextPath(request.nextUrl.searchParams.get('next')), request.url),
        )
      : NextResponse.next();
  }

  if (signedIn) {
    const headers = new Headers(request.headers);
    headers.set(CURRENT_PATH_HEADER, `${request.nextUrl.pathname}${request.nextUrl.search}`);

    return NextResponse.next({ request: { headers } });
  }

  const login = new URL(LOGIN_PATH, request.url);
  login.searchParams.set('next', `${request.nextUrl.pathname}${request.nextUrl.search}`);

  return NextResponse.redirect(login);
}

export const config = {
  matcher: ['/((?!api|session-expired|_next/static|_next/image|favicon.ico|.*\\.[a-z0-9]+$).*)'],
};
