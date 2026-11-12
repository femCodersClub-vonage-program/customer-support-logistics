import { ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';

import { IS_PUBLIC, ROLES } from './auth.decorators.js';
import { DEV_ACTOR_HEADER, parseDevActor } from './dev-actor.js';
import { SESSION_COOKIE, readCookie } from './session-cookie.js';
import { SessionsService } from './sessions.service.js';

import type { AuthActor, AuthenticatedRequest } from './auth-actor.js';
import type { Env } from '../config/env.schema.js';
import type { AuthRole } from '@csl/contracts';
import type { CanActivate, ExecutionContext } from '@nestjs/common';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(SessionsService) private readonly sessions: SessionsService,
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];

    if (this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, targets)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const actor = await this.authenticate(request);

    if (!actor) {
      throw new UnauthorizedException('A valid session is required');
    }

    const roles = this.reflector.getAllAndOverride<AuthRole[] | undefined>(ROLES, targets);

    if (roles && !roles.includes(actor.role)) {
      throw new ForbiddenException('This action is not available for your role');
    }

    request.actor = actor;

    return true;
  }

  private async authenticate(request: AuthenticatedRequest): Promise<AuthActor | null> {
    const token = readCookie(request.headers.cookie, SESSION_COOKIE);
    const sessionActor = token ? await this.sessions.resolve(token) : null;

    if (sessionActor || !this.config.get('DEV_AUTH_ENABLED', { infer: true })) {
      return sessionActor;
    }

    return parseDevActor(request.headers[DEV_ACTOR_HEADER]);
  }
}
