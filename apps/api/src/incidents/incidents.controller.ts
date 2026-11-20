import {
  changeIncidentStatusBodySchema,
  createIncidentBodySchema,
  incidentIdParamsSchema,
  listIncidentsQuerySchema,
} from '@csl/contracts';
import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import { CurrentActor, Roles } from '../auth/auth.decorators.js';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe.js';

import { IncidentsService } from './incidents.service.js';

import type { AuthActor } from '../auth/auth-actor.js';
import type {
  ChangeIncidentStatusBody,
  CreateIncidentBody,
  IncidentDetail,
  IncidentIdParams,
  ListIncidentsQuery,
  ListIncidentsResponse,
} from '@csl/contracts';
import type { Incident } from '@csl/shared-types';

@Controller('incidents')
export class IncidentsController {
  constructor(@Inject(IncidentsService) private readonly incidents: IncidentsService) {}

  @Post()
  @Roles('customer')
  create(
    @CurrentActor() actor: AuthActor,
    @Body(new ZodValidationPipe(createIncidentBodySchema)) body: CreateIncidentBody,
  ): Promise<Incident> {
    return this.incidents.create(actor.id, body);
  }

  @Get()
  @Roles('agent')
  list(
    @Query(new ZodValidationPipe(listIncidentsQuerySchema)) query: ListIncidentsQuery,
  ): Promise<ListIncidentsResponse> {
    return this.incidents.list(query);
  }

  @Get(':id')
  findOne(
    @CurrentActor() actor: AuthActor,
    @Param(new ZodValidationPipe(incidentIdParamsSchema)) params: IncidentIdParams,
  ): Promise<IncidentDetail> {
    return this.incidents.findOne(actor, params.id);
  }

  @Patch(':id/status')
  @Roles('agent')
  changeStatus(
    @CurrentActor() actor: AuthActor,
    @Param(new ZodValidationPipe(incidentIdParamsSchema)) params: IncidentIdParams,
    @Body(new ZodValidationPipe(changeIncidentStatusBodySchema)) body: ChangeIncidentStatusBody,
  ): Promise<Incident> {
    return this.incidents.changeStatus(actor, params.id, body);
  }

  @Post(':id/assign-to-me')
  @Roles('agent')
  assignToMe(
    @CurrentActor() actor: AuthActor,
    @Param(new ZodValidationPipe(incidentIdParamsSchema)) params: IncidentIdParams,
  ): Promise<Incident> {
    return this.incidents.assignToMe(actor, params.id);
  }

  @Post(':id/notify-driver')
  @Roles('agent')
  notifyDriver(
    @CurrentActor() actor: AuthActor,
    @Param(new ZodValidationPipe(incidentIdParamsSchema)) params: IncidentIdParams,
  ): Promise<Incident> {
    return this.incidents.notifyDriver(actor, params.id);
  }

  @Post(':id/notify-driver/again')
  @Roles('agent')
  notifyDriverAgain(
    @CurrentActor() actor: AuthActor,
    @Param(new ZodValidationPipe(incidentIdParamsSchema)) params: IncidentIdParams,
    @Headers('Idempotency-Key') idempotencyKey: string,
  ): Promise<Incident> {
    return this.incidents.notifyDriverAgain(actor, params.id, idempotencyKey);
  }
}
