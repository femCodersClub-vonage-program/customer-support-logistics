import { Module } from '@nestjs/common';

import { VonageModule } from '../vonage/vonage.module.js';

import { OutboundSmsService } from './outbound-sms.service.js';

@Module({
  imports: [VonageModule],
  providers: [OutboundSmsService],
  exports: [OutboundSmsService],
})
export class CommunicationsModule {}
