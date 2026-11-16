import {
  changeIncidentStatusBodySchema,
  createIncidentBodySchema,
  evidenceIdParamsSchema,
  incidentIdParamsSchema,
  listIncidentsQuerySchema,
  requestEvidenceUploadBodySchema,
} from '@csl/contracts';
import { Body, Controller, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';

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
  EvidenceIdParams,
  EvidenceUploadUrl,
  EvidenceDownload,
  RequestEvidenceUploadBody,
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
    return this.incidents.create(actor, body);
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

  @Post(':id/evidence/upload-url')
  @Roles('customer')
  requestEvidenceUpload(
    @CurrentActor() actor: AuthActor,
    @Param(new ZodValidationPipe(incidentIdParamsSchema)) params: IncidentIdParams,
    @Body(new ZodValidationPipe(requestEvidenceUploadBodySchema)) body: RequestEvidenceUploadBody,
  ): Promise<EvidenceUploadUrl> {
    return this.incidents.requestEvidenceUpload(actor, params.id, body);
  }

  @Post(':id/evidence/:evidenceId/complete')
  @Roles('customer')
  completeEvidenceUpload(
    @CurrentActor() actor: AuthActor,
    @Param(new ZodValidationPipe(evidenceIdParamsSchema)) params: EvidenceIdParams,
  ): Promise<void> {
    return this.incidents.completeEvidenceUpload(actor, params.id, params.evidenceId);
  }

  @Get(':id/evidence')
  listEvidence(
    @CurrentActor() actor: AuthActor,
    @Param(new ZodValidationPipe(incidentIdParamsSchema)) params: IncidentIdParams,
  ): Promise<EvidenceDownload[]> {
    return this.incidents.listEvidence(actor, params.id);
  }
}
