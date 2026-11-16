import {
  agentLoginBodySchema,
  customerLoginCheckBodySchema,
  customerLoginStartBodySchema,
} from '@csl/contracts';
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
import { CustomerLoginService } from './customer-login.service.js';
import { VERIFICATION_TTL_MS } from './pending-verifications.js';
import { PhoneThrottlerGuard } from './phone-throttler.guard.js';
import {
  SESSION_COOKIE,
  VERIFICATION_COOKIE,
  clearedSessionCookieOptions,
  readCookie,
  sessionCookieOptions,
} from './session-cookie.js';

import type { AuthActor } from './auth-actor.js';
import type {
  AgentLoginBody,
  CurrentUser,
  CustomerLoginCheckBody,
  CustomerLoginStartBody,
  CustomerLoginStartResponse,
} from '@csl/contracts';
import type { Request, Response } from 'express';

export const AGENT_LOGIN_ATTEMPTS_PER_MINUTE = 10;

export const CUSTOMER_LOGIN_STARTS_PER_WINDOW = 10;

export const CUSTOMER_LOGIN_START_WINDOW_MS = 15 * 60 * 1000;

export const CUSTOMER_LOGIN_CHECKS_PER_MINUTE = 10;

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(CustomerLoginService) private readonly customerLogin: CustomerLoginService,
  ) {}

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
  @Post('customer/start')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard, PhoneThrottlerGuard)
  @Throttle({
    default: { limit: CUSTOMER_LOGIN_STARTS_PER_WINDOW, ttl: CUSTOMER_LOGIN_START_WINDOW_MS },
  })
  async startCustomerLogin(
    @Body(new ZodValidationPipe(customerLoginStartBodySchema)) body: CustomerLoginStartBody,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CustomerLoginStartResponse> {
    const { requestId, checkUrl } = await this.customerLogin.start(body.phone);
    response.cookie(VERIFICATION_COOKIE, requestId, sessionCookieOptions(VERIFICATION_TTL_MS));

    return checkUrl === undefined ? { channel: 'sms' } : { channel: 'silent_auth', checkUrl };
  }

  @Public()
  @Post('customer/sms')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: CUSTOMER_LOGIN_CHECKS_PER_MINUTE, ttl: 60_000 } })
  async moveCustomerLoginToSms(@Req() request: Request): Promise<void> {
    await this.customerLogin.moveToSms(readCookie(request.headers.cookie, VERIFICATION_COOKIE));
  }

  @Public()
  @Post('customer/check')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: CUSTOMER_LOGIN_CHECKS_PER_MINUTE, ttl: 60_000 } })
  async checkCustomerLogin(
    @Body(new ZodValidationPipe(customerLoginCheckBodySchema)) body: CustomerLoginCheckBody,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CurrentUser> {
    const { session, user } = await this.customerLogin.check(
      readCookie(request.headers.cookie, VERIFICATION_COOKIE),
      body,
      readCookie(request.headers.cookie, SESSION_COOKIE),
    );
    response.clearCookie(VERIFICATION_COOKIE, clearedSessionCookieOptions());
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
