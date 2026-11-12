import { incidentIdParamsSchema } from '@csl/contracts';
import { Controller, Inject, Param, Post, UseGuards } from '@nestjs/common';

import { CurrentActor } from '../common/dev-auth/current-actor.decorator.js';
import { DevActorGuard } from '../common/dev-auth/dev-actor.guard.js';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe.js';

import { MediationService } from './mediation.service.js';

import type { StartedMediation } from './mediation.service.js';
import type { DevActor } from '../common/dev-auth/dev-actor.js';
import type { IncidentIdParams } from '@csl/contracts';
import type { Communication } from '@csl/shared-types';

@Controller('incidents/:id/mediation')
@UseGuards(DevActorGuard)
export class MediationController {
  constructor(@Inject(MediationService) private readonly mediation: MediationService) {}

  @Post()
  start(
    @CurrentActor() actor: DevActor,
    @Param(new ZodValidationPipe(incidentIdParamsSchema)) params: IncidentIdParams,
  ): Promise<StartedMediation> {
    return this.mediation.start(actor, params.id);
  }

  @Post('driver-call')
  callDriver(
    @CurrentActor() actor: DevActor,
    @Param(new ZodValidationPipe(incidentIdParamsSchema)) params: IncidentIdParams,
  ): Promise<Communication> {
    return this.mediation.callDriver(actor, params.id);
  }
}
