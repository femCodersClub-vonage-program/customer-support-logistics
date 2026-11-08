import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { currentActorFactory } from './current-actor.decorator.js';
import { DevActorGuard } from './dev-actor.guard.js';
import { parseDevActor } from './dev-actor.js';

import type { DevActorRequest } from './dev-actor.js';
import type { ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

const CUSTOMER_ID = '0b9f1c9e-8a43-4d1e-9a51-3f3c2b8a7d10';

const contextFor = (request: Partial<DevActorRequest>) =>
  ({ switchToHttp: () => ({ getRequest: () => request }) }) as unknown as ExecutionContext;

const guardWith = (enabled: boolean) =>
  new DevActorGuard({ get: () => enabled } as unknown as ConfigService<never, true>);

describe('parseDevActor', () => {
  it('parses customer and agent actors', () => {
    expect(parseDevActor(`customer:${CUSTOMER_ID}`)).toEqual({ role: 'customer', id: CUSTOMER_ID });
    expect(parseDevActor(`agent:${CUSTOMER_ID}`)).toEqual({ role: 'agent', id: CUSTOMER_ID });
  });

  it.each([
    undefined,
    ['customer', CUSTOMER_ID],
    '',
    'customer',
    `driver:${CUSTOMER_ID}`,
    'customer:not-a-uuid',
    `customer:${CUSTOMER_ID}:extra`,
  ])('rejects %j', (header) => {
    expect(parseDevActor(header)).toBeNull();
  });
});

describe('DevActorGuard', () => {
  it('attaches the actor from the header to the request', () => {
    const request: Partial<DevActorRequest> = {
      headers: { 'x-dev-actor': `customer:${CUSTOMER_ID}` },
    };

    expect(guardWith(true).canActivate(contextFor(request))).toBe(true);
    expect(request.devActor).toEqual({ role: 'customer', id: CUSTOMER_ID });
  });

  it('rejects requests without a valid header', () => {
    expect(() => guardWith(true).canActivate(contextFor({ headers: {} }))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects every request when dev auth is disabled', () => {
    const request = { headers: { 'x-dev-actor': `customer:${CUSTOMER_ID}` } };

    expect(() => guardWith(false).canActivate(contextFor(request))).toThrow(
      'Authentication is not available yet',
    );
  });
});

describe('CurrentActor', () => {
  it('returns the actor attached by the guard', () => {
    const devActor = { role: 'agent' as const, id: CUSTOMER_ID };

    expect(currentActorFactory(undefined, contextFor({ devActor }))).toEqual(devActor);
  });

  it('fails loudly when the guard did not run', () => {
    expect(() => currentActorFactory(undefined, contextFor({}))).toThrow(/DevActorGuard/);
  });
});
