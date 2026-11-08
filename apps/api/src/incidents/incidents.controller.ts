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
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { CurrentActor } from '../common/dev-auth/current-actor.decorator.js';
import { DevActorGuard } from '../common/dev-auth/dev-actor.guard.js';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe.js';

import { IncidentsService } from './incidents.service.js';

import type { DevActor } from '../common/dev-auth/dev-actor.js';
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
@UseGuards(DevActorGuard)
export class IncidentsController {
  constructor(@Inject(IncidentsService) private readonly incidents: IncidentsService) {}

  @Post()
  create(
    @CurrentActor() actor: DevActor,
    @Body(new ZodValidationPipe(createIncidentBodySchema)) body: CreateIncidentBody,
  ): Promise<Incident> {
    return this.incidents.create(actor, body);
  }

  @Get()
  list(
    @Query(new ZodValidationPipe(listIncidentsQuerySchema)) query: ListIncidentsQuery,
  ): Promise<ListIncidentsResponse> {
    return this.incidents.list(query);
  }

  @Get(':id')
  findOne(
    @CurrentActor() actor: DevActor,
    @Param(new ZodValidationPipe(incidentIdParamsSchema)) params: IncidentIdParams,
  ): Promise<IncidentDetail> {
    return this.incidents.findOne(actor, params.id);
  }

  @Patch(':id/status')
  changeStatus(
    @CurrentActor() actor: DevActor,
    @Param(new ZodValidationPipe(incidentIdParamsSchema)) params: IncidentIdParams,
    @Body(new ZodValidationPipe(changeIncidentStatusBodySchema)) body: ChangeIncidentStatusBody,
  ): Promise<Incident> {
    return this.incidents.changeStatus(actor, params.id, body);
  }
}
