import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { LOGIN_PATH, SESSION_COOKIE } from '../../lib/session';

import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  (await cookies()).delete(SESSION_COOKIE);

  return NextResponse.redirect(new URL(LOGIN_PATH, request.url));
}
