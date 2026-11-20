import { describe, expect, it } from 'vitest';

import { currentActorFactory } from './auth.decorators.js';

import type { AuthenticatedRequest } from './auth-actor.js';
import type { ExecutionContext } from '@nestjs/common';

const contextFor = (request: Partial<AuthenticatedRequest>) =>
  ({ switchToHttp: () => ({ getRequest: () => request }) }) as unknown as ExecutionContext;

describe('CurrentActor', () => {
  it('returns the actor attached by the guard', () => {
    const actor = { role: 'agent' as const, id: '0b9f1c9e-8a43-4d1e-9a51-3f3c2b8a7d10' };

    expect(currentActorFactory(undefined, contextFor({ actor }))).toEqual(actor);
  });

  it('fails loudly on a route the guard did not authenticate', () => {
    expect(() => currentActorFactory(undefined, contextFor({}))).toThrow(/@Public\(\)/);
  });
});
