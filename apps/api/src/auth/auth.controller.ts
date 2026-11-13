import { agentLoginBodySchema } from '@csl/contracts';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

import { ZodValidationPipe } from '../common/validation/zod-validation.pipe.js';

import { CurrentActor, Public } from './auth.decorators.js';
import { AuthService } from './auth.service.js';
import {
  SESSION_COOKIE,
  clearedSessionCookieOptions,
  readCookie,
  sessionCookieOptions,
} from './session-cookie.js';

import type { AuthActor } from './auth-actor.js';
import type { AgentLoginBody, CurrentUser } from '@csl/contracts';
import type { Request, Response } from 'express';

export const AGENT_LOGIN_ATTEMPTS_PER_MINUTE = 10;

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Public()
  @Post('agent/login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: AGENT_LOGIN_ATTEMPTS_PER_MINUTE, ttl: 60_000 } })
  async loginAgent(
    @Body(new ZodValidationPipe(agentLoginBodySchema)) body: AgentLoginBody,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CurrentUser> {
    const previousToken = readCookie(request.headers.cookie, SESSION_COOKIE);
    const { session, user } = await this.auth.loginAgent(body, previousToken);
    response.cookie(SESSION_COOKIE, session.token, sessionCookieOptions(session.lifetimeMs));

    return user;
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(readCookie(request.headers.cookie, SESSION_COOKIE));
    response.clearCookie(SESSION_COOKIE, clearedSessionCookieOptions());
  }

  @Get('me')
  me(@CurrentActor() actor: AuthActor): Promise<CurrentUser> {
    return this.auth.currentUser(actor);
  }
}
