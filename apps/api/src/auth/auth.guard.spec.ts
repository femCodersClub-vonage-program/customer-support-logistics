import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import { Public, Roles } from './auth.decorators.js';
import { AuthGuard } from './auth.guard.js';
import { SESSION_COOKIE } from './session-cookie.js';

import type { AuthActor, AuthenticatedRequest } from './auth-actor.js';
import type { SessionsService } from './sessions.service.js';
import type { ExecutionContext } from '@nestjs/common';

const SESSION_AGENT: AuthActor = { role: 'agent', id: '0b9f1c9e-8a43-4d1e-9a51-3f3c2b8a7d10' };

class Routes {
  @Public()
  open(): void {}

  protectedRoute(): void {}

  @Roles('customer')
  customerRoute(): void {}
}

const setup = () => {
  const resolve = vi.fn((token: string) =>
    Promise.resolve(token === 'valid-token' ? SESSION_AGENT : null),
  );
  const guard = new AuthGuard(new Reflector(), { resolve } as unknown as SessionsService);

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

const SESSION = { cookie: `${SESSION_COOKIE}=valid-token` };

describe('AuthGuard', () => {
  it('attaches the actor behind a valid session cookie', async () => {
    const { guard } = setup();
    const { context, request } = contextFor('protectedRoute', SESSION);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.actor).toEqual(SESSION_AGENT);
  });

  it.each([
    ['no cookie', {}],
    ['an unknown session', { cookie: `${SESSION_COOKIE}=forged` }],
    ['the old development header', { 'x-dev-actor': `agent:${SESSION_AGENT.id}` }],
  ])('rejects a request with %s', async (_case, headers) => {
    const { guard } = setup();

    await expect(guard.canActivate(contextFor('protectedRoute', headers).context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a session with the wrong role', async () => {
    const { guard } = setup();

    await expect(guard.canActivate(contextFor('customerRoute', SESSION).context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('lets public routes through without looking up the session', async () => {
    const { guard, resolve } = setup();
    const { context } = contextFor('open', SESSION);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(resolve).not.toHaveBeenCalled();
  });
});
