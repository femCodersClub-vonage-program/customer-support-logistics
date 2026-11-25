import { Module } from '@nestjs/common';

import { BackgroundTasks } from './background-tasks.js';

@Module({
  providers: [BackgroundTasks],
  exports: [BackgroundTasks],
})
export class BackgroundTasksModule {}
