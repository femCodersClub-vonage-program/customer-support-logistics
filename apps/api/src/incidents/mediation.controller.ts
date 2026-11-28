import { incidentIdParamsSchema, mediationParticipantParamsSchema } from '@csl/contracts';
import { Controller, HttpCode, HttpStatus, Inject, Param, Post } from '@nestjs/common';

import { CurrentActor, Roles } from '../auth/auth.decorators.js';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe.js';

import { MediationService } from './mediation.service.js';

import type { AuthActor } from '../auth/auth-actor.js';
import type {
  IncidentIdParams,
  MediationParticipantParams,
  StartMediationResponse,
} from '@csl/contracts';
import type { Communication } from '@csl/shared-types';

@Controller('incidents/:id/mediation')
@Roles('agent')
export class MediationController {
  constructor(@Inject(MediationService) private readonly mediation: MediationService) {}

  @Post()
  start(
    @CurrentActor() actor: AuthActor,
    @Param(new ZodValidationPipe(incidentIdParamsSchema)) params: IncidentIdParams,
  ): Promise<StartMediationResponse> {
    return this.mediation.start(actor.id, params.id);
  }

  @Post('driver-call')
  callDriver(
    @Param(new ZodValidationPipe(incidentIdParamsSchema)) params: IncidentIdParams,
  ): Promise<Communication> {
    return this.mediation.callDriver(params.id);
  }

  @Post('end')
  @HttpCode(HttpStatus.NO_CONTENT)
  end(
    @CurrentActor() actor: AuthActor,
    @Param(new ZodValidationPipe(incidentIdParamsSchema)) params: IncidentIdParams,
  ): Promise<void> {
    return this.mediation.end(actor.id, params.id);
  }

  @Post('participants/:participant/remove')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeParticipant(
    @CurrentActor() actor: AuthActor,
    @Param(new ZodValidationPipe(mediationParticipantParamsSchema))
    params: MediationParticipantParams,
  ): Promise<void> {
    return this.mediation.removeParticipant(actor.id, params.id, params.participant);
  }
}
