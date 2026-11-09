import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { verifyVonageJwt } from './vonage-jwt.js';

import type { VonageJwtClaims } from './vonage-jwt.js';
import type { Env } from '../../config/env.schema.js';
import type { CanActivate, ExecutionContext, RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';

export interface VonageSignedRequest extends RawBodyRequest<Request> {
  vonageClaims?: VonageJwtClaims;
}

const INVALID_SIGNATURE = 'Invalid or missing Vonage signature';

function bearerToken(header: string | undefined): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec(header ?? '');

  return match?.[1] ?? null;
}

@Injectable()
export class VonageSignatureGuard implements CanActivate {
  private readonly logger = new Logger(VonageSignatureGuard.name);

  constructor(@Inject(ConfigService) private readonly config: ConfigService<Env, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<VonageSignedRequest>();
    const secret = this.config.get('VONAGE_SIGNATURE_SECRET', { infer: true });

    if (secret === undefined) {
      this.logger.error(
        `Rejected ${request.method} ${request.path}: VONAGE_SIGNATURE_SECRET is not set`,
      );
      throw new UnauthorizedException(INVALID_SIGNATURE);
    }

    const token = bearerToken(request.headers.authorization);

    if (token === null) {
      this.logger.warn(`Rejected ${request.method} ${request.path}: missing bearer token`);
      throw new UnauthorizedException(INVALID_SIGNATURE);
    }

    const result = verifyVonageJwt({
      token,
      secret,
      rawBody: request.rawBody,
      apiKey: this.config.get('VONAGE_API_KEY', { infer: true }),
    });

    if (!result.valid) {
      this.logger.warn(`Rejected ${request.method} ${request.path}: ${result.reason}`);
      throw new UnauthorizedException(INVALID_SIGNATURE);
    }

    request.vonageClaims = result.claims;

    return true;
  }
}
