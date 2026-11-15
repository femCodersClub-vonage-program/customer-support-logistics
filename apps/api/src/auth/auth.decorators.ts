import { SetMetadata, createParamDecorator } from '@nestjs/common';

import type { AuthActor, AuthenticatedRequest } from './auth-actor.js';
import type { AuthRole } from '@csl/contracts';
import type { ExecutionContext } from '@nestjs/common';

export const IS_PUBLIC = 'auth:is-public';

export const ROLES = 'auth:roles';

export const Public = () => SetMetadata(IS_PUBLIC, true);

export const Roles = (...roles: [AuthRole, ...AuthRole[]]) => SetMetadata(ROLES, roles);

export function currentActorFactory(_data: unknown, context: ExecutionContext): AuthActor {
  const actor = context.switchToHttp().getRequest<AuthenticatedRequest>().actor;

  if (!actor) {
    throw new Error('CurrentActor needs a route protected by AuthGuard, not a @Public() one');
  }

  return actor;
}

export const CurrentActor = createParamDecorator(currentActorFactory);
