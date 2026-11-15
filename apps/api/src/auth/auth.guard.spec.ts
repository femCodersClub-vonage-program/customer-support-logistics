import { UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import { Public } from './auth.decorators.js';
import { AuthGuard } from './auth.guard.js';
import { DEV_ACTOR_HEADER } from './dev-actor.js';
import { SESSION_COOKIE } from './session-cookie.js';

import type { AuthActor, AuthenticatedRequest } from './auth-actor.js';
import type { SessionsService } from './sessions.service.js';
import type { Env } from '../config/env.schema.js';
import type { ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

const SESSION_AGENT: AuthActor = { role: 'agent', id: '0b9f1c9e-8a43-4d1e-9a51-3f3c2b8a7d10' };
const HEADER_AGENT: AuthActor = { role: 'agent', id: '5d2c7a41-6e0b-4f3a-8c19-2b7e9d4f1a63' };

class Routes {
  @Public()
  open(): void {}

  protectedRoute(): void {}
}

const setup = ({ devAuthEnabled }: { devAuthEnabled: boolean }) => {
  const resolve = vi.fn((token: string) =>
    Promise.resolve(token === 'valid-token' ? SESSION_AGENT : null),
  );
  const config = {
    get: (key: string) => (key === 'DEV_AUTH_ENABLED' ? devAuthEnabled : undefined),
  } as unknown as ConfigService<Env, true>;
  const guard = new AuthGuard(new Reflector(), { resolve } as unknown as SessionsService, config);

  return { guard, resolve };
};

const contextFor = (
  handler: keyof Routes,
  headers: Record<string, string>,
): { context: ExecutionContext; request: Partial<AuthenticatedRequest> } => {
  const request: Partial<AuthenticatedRequest> = { headers };
  const context = {
    getHandler: () => Routes.prototype[handler],
    getClass: () => Routes,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;

  return { context, request };
};

const headerFor = (actor: AuthActor) => ({ [DEV_ACTOR_HEADER]: `${actor.role}:${actor.id}` });

describe('AuthGuard', () => {
  it('ignores the dev actor header when dev auth is disabled', async () => {
    const { guard } = setup({ devAuthEnabled: false });
    const { context } = contextFor('protectedRoute', headerFor(HEADER_AGENT));

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('accepts the dev actor header when dev auth is enabled and there is no session', async () => {
    const { guard } = setup({ devAuthEnabled: true });
    const { context, request } = contextFor('protectedRoute', headerFor(HEADER_AGENT));

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.actor).toEqual(HEADER_AGENT);
  });

  it('prefers the session over the dev actor header', async () => {
    const { guard } = setup({ devAuthEnabled: true });
    const { context, request } = contextFor('protectedRoute', {
      cookie: `${SESSION_COOKIE}=valid-token`,
      ...headerFor(HEADER_AGENT),
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.actor).toEqual(SESSION_AGENT);
  });

  it('lets public routes through without looking up the session', async () => {
    const { guard, resolve } = setup({ devAuthEnabled: false });
    const { context } = contextFor('open', { cookie: `${SESSION_COOKIE}=valid-token` });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(resolve).not.toHaveBeenCalled();
  });
});
