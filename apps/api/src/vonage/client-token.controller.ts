import { createClientTokenBodySchema } from '@csl/contracts';
import { Body, Controller, Inject, Post } from '@nestjs/common';

import { CurrentActor, Roles } from '../auth/auth.decorators.js';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe.js';

import { ClientTokenService } from './client-token.service.js';

import type { AuthActor } from '../auth/auth-actor.js';
import type { ClientTokenResponse, CreateClientTokenBody } from '@csl/contracts';

@Controller('vonage')
@Roles('customer', 'agent')
export class ClientTokenController {
  constructor(@Inject(ClientTokenService) private readonly clientTokens: ClientTokenService) {}

  @Post('client-token')
  create(
    @CurrentActor() actor: AuthActor,
    @Body(new ZodValidationPipe(createClientTokenBodySchema)) body: CreateClientTokenBody,
  ): Promise<ClientTokenResponse> {
    return this.clientTokens.create(actor, body.incidentId);
  }
}
