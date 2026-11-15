import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { safeNextPath } from '../../lib/next-path';
import { LOGIN_PATH, SESSION_COOKIE } from '../../lib/session';

import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  (await cookies()).delete(SESSION_COOKIE);

  const login = new URL(LOGIN_PATH, request.url);
  login.searchParams.set('next', safeNextPath(request.nextUrl.searchParams.get('next')));

  return NextResponse.redirect(login);
}
