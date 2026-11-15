import { SESSION_COOKIE } from '../../src/auth/session-cookie.js';
import { SessionsService } from '../../src/auth/sessions.service.js';

import type { TestApp } from './app.js';
import type { AuthActor } from '../../src/auth/auth-actor.js';

export async function sessionCookieFor(testApp: TestApp, actor: AuthActor): Promise<string> {
  const { token } = await testApp.app.get(SessionsService).create(actor);

  return `${SESSION_COOKIE}=${token}`;
}

export async function sessionCookiesFor<Name extends string>(
  testApp: TestApp,
  actors: Record<Name, AuthActor>,
): Promise<Record<Name, string>> {
  const entries = await Promise.all(
    Object.entries<AuthActor>(actors).map(
      async ([name, actor]) => [name, await sessionCookieFor(testApp, actor)] as const,
    ),
  );

  return Object.fromEntries(entries) as Record<Name, string>;
}
