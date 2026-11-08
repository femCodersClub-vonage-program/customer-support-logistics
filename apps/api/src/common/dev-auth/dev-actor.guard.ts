import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { DEV_ACTOR_HEADER, parseDevActor } from './dev-actor.js';

import type { DevActorRequest } from './dev-actor.js';
import type { Env } from '../../config/env.schema.js';
import type { CanActivate, ExecutionContext } from '@nestjs/common';

@Injectable()
export class DevActorGuard implements CanActivate {
  constructor(@Inject(ConfigService) private readonly config: ConfigService<Env, true>) {}

  canActivate(context: ExecutionContext): boolean {
    if (!this.config.get('DEV_AUTH_ENABLED', { infer: true })) {
      throw new UnauthorizedException('Authentication is not available yet');
    }

    const request = context.switchToHttp().getRequest<DevActorRequest>();
    const actor = parseDevActor(request.headers[DEV_ACTOR_HEADER]);

    if (!actor) {
      throw new UnauthorizedException(
        `Missing or invalid ${DEV_ACTOR_HEADER} header, expected "customer:<uuid>" or "agent:<uuid>"`,
      );
    }

    request.devActor = actor;

    return true;
  }
}
