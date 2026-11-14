import { createParamDecorator } from '@nestjs/common';

import type { DevActor, DevActorRequest } from './dev-actor.js';
import type { ExecutionContext } from '@nestjs/common';

export function currentActorFactory(_data: unknown, context: ExecutionContext): DevActor {
  const actor = context.switchToHttp().getRequest<DevActorRequest>().devActor;

  if (!actor) {
    throw new Error('CurrentActor requires DevActorGuard on the route');
  }

  return actor;
}

export const CurrentActor = createParamDecorator(currentActorFactory);
