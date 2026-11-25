import { Module } from '@nestjs/common';

import { BackgroundTasksModule } from '../common/background/background-tasks.module.js';
import { CommunicationsModule } from '../communications/communications.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { VonageModule } from '../vonage/vonage.module.js';

import { IncidentsController } from './incidents.controller.js';
import { IncidentsService } from './incidents.service.js';
import { MediationController } from './mediation.controller.js';
import { MediationService } from './mediation.service.js';

@Module({
  imports: [BackgroundTasksModule, VonageModule, StorageModule, CommunicationsModule],
  controllers: [IncidentsController, MediationController],
  providers: [IncidentsService, MediationService],
  exports: [MediationService],
})
export class IncidentsModule {}
