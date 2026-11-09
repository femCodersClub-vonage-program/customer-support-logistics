import { Module } from '@nestjs/common';

import { LoggingSmsSender } from './logging-sms-sender.js';
import { SMS_SENDER } from './sms-sender.js';

@Module({
  providers: [{ provide: SMS_SENDER, useClass: LoggingSmsSender }],
  exports: [SMS_SENDER],
})
export class VonageModule {}
