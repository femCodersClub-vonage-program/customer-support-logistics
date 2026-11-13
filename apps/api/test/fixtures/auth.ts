import { SESSION_COOKIE } from '../../src/auth/session-cookie.js';
import { SessionsService } from '../../src/auth/sessions.service.js';

import type { TestApp } from './app.js';
import type { AuthActor } from '../../src/auth/auth-actor.js';

export async function sessionCookieFor(testApp: TestApp, actor: AuthActor): Promise<string> {
  const { token } = await testApp.app.get(SessionsService).create(actor);

  return `${SESSION_COOKIE}=${token}`;
}
