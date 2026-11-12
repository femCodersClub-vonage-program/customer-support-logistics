import type { CookieOptions } from 'express';

export const SESSION_COOKIE = 'csl_session';

const BASE_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/',
};

export function sessionCookieOptions(maxAgeMs: number): CookieOptions {
  return { ...BASE_COOKIE_OPTIONS, maxAge: maxAgeMs };
}

export function clearedSessionCookieOptions(): CookieOptions {
  return BASE_COOKIE_OPTIONS;
}

export function readCookie(header: string | undefined, name: string): string | null {
  for (const pair of header?.split(';') ?? []) {
    const separator = pair.indexOf('=');

    if (separator !== -1 && pair.slice(0, separator).trim() === name) {
      return pair.slice(separator + 1).trim() || null;
    }
  }

  return null;
}
