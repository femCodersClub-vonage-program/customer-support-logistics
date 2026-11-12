import { Module } from '@nestjs/common';

import { VonageModule } from '../vonage/vonage.module.js';

import { IncidentsController } from './incidents.controller.js';
import { IncidentsService } from './incidents.service.js';
import { MediationService } from './mediation.service.js';

@Module({
  imports: [VonageModule],
  controllers: [IncidentsController],
  providers: [IncidentsService, MediationService],
})
export class IncidentsModule {}
