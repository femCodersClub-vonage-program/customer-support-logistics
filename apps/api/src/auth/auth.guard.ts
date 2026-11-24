import { ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { IS_PUBLIC, ROLES } from './auth.decorators.js';
import { SESSION_COOKIE, readCookie } from './session-cookie.js';
import { SessionsService } from './sessions.service.js';

import type { AuthenticatedRequest } from './auth-actor.js';
import type { AuthRole } from '@csl/contracts';
import type { CanActivate, ExecutionContext } from '@nestjs/common';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(SessionsService) private readonly sessions: SessionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];

    if (this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, targets)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = readCookie(request.headers.cookie, SESSION_COOKIE);
    const actor = token ? await this.sessions.resolve(token) : null;

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
}
