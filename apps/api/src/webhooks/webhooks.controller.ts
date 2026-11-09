import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

import { ZodValidationPipe } from '../common/validation/zod-validation.pipe.js';

import { VonageSignatureGuard } from './signature/vonage-signature.guard.js';
import {
  inboundSmsSchema,
  messageStatusSchema,
  voiceAnswerSchema,
  voiceEventSchema,
  voiceInputQuerySchema,
  voiceInputSchema,
} from './vonage-payloads.js';
import { WebhooksService } from './webhooks.service.js';

import type {
  InboundSms,
  MessageStatus,
  VoiceAnswer,
  VoiceEvent,
  VoiceInput,
  VoiceInputQuery,
} from './vonage-payloads.js';
import type { NccoAction } from '../vonage/ncco.js';

@Controller('webhooks')
@UseGuards(ThrottlerGuard, VonageSignatureGuard)
export class WebhooksController {
  constructor(@Inject(WebhooksService) private readonly webhooks: WebhooksService) {}

  @Post('sms/inbound')
  @HttpCode(HttpStatus.NO_CONTENT)
  inboundSms(@Body(new ZodValidationPipe(inboundSmsSchema)) body: InboundSms): Promise<void> {
    return this.webhooks.handleInboundSms(body);
  }

  @Post('sms/status')
  @HttpCode(HttpStatus.NO_CONTENT)
  smsStatus(@Body(new ZodValidationPipe(messageStatusSchema)) body: MessageStatus): Promise<void> {
    return this.webhooks.handleMessageStatus(body);
  }

  @Get('voice/answer')
  answerCall(
    @Query(new ZodValidationPipe(voiceAnswerSchema)) query: VoiceAnswer,
  ): Promise<NccoAction[]> {
    return this.webhooks.answerCall(query);
  }

  @Post('voice/answer')
  @HttpCode(HttpStatus.OK)
  answerCallByPost(
    @Body(new ZodValidationPipe(voiceAnswerSchema)) body: VoiceAnswer,
  ): Promise<NccoAction[]> {
    return this.webhooks.answerCall(body);
  }

  @Post('voice/event')
  @HttpCode(HttpStatus.NO_CONTENT)
  voiceEvent(@Body(new ZodValidationPipe(voiceEventSchema)) body: VoiceEvent): Promise<void> {
    return this.webhooks.handleVoiceEvent(body);
  }

  @Post('voice/input')
  @HttpCode(HttpStatus.OK)
  voiceInput(
    @Query(new ZodValidationPipe(voiceInputQuerySchema)) query: VoiceInputQuery,
    @Body(new ZodValidationPipe(voiceInputSchema)) body: VoiceInput,
  ): Promise<NccoAction[]> {
    return this.webhooks.handleVoiceInput(query.incident, body);
  }
}
