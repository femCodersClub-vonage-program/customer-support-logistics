import { COMMUNICATION_DIRECTIONS } from '@csl/shared-types';
import { z } from 'zod';

export const inboundSmsSchema = z.looseObject({
  message_uuid: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  text: z.string().default(''),
  timestamp: z.string().optional(),
});

export type InboundSms = z.output<typeof inboundSmsSchema>;

export const messageStatusSchema = z.looseObject({
  message_uuid: z.string().min(1),
  status: z.string().min(1),
  from: z.string().optional(),
  to: z.string().optional(),
  timestamp: z.string().optional(),
});

export type MessageStatus = z.output<typeof messageStatusSchema>;

export const voiceAnswerSchema = z.looseObject({
  uuid: z.string().optional(),
  conversation_uuid: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  endpoint_type: z.string().optional(),
  custom_data: z.unknown().optional(),
});

export type VoiceAnswer = z.output<typeof voiceAnswerSchema>;

export const voiceEventSchema = z.looseObject({
  uuid: z.string().min(1).optional(),
  conversation_uuid: z.string().optional(),
  status: z.string().min(1).optional(),
  direction: z.enum(COMMUNICATION_DIRECTIONS).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  timestamp: z.string().optional(),
  duration: z.coerce.number().int().min(0).optional(),
});

export type VoiceEvent = z.output<typeof voiceEventSchema>;

export const voiceInputSchema = z.looseObject({
  uuid: z.string().min(1).optional(),
  conversation_uuid: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  timestamp: z.string().min(1),
  dtmf: z
    .looseObject({
      digits: z.string().optional(),
      timed_out: z.boolean().optional(),
    })
    .optional(),
});

export type VoiceInput = z.output<typeof voiceInputSchema>;

export const voiceInputQuerySchema = z.object({
  incident: z.uuid().optional().catch(undefined),
});

export type VoiceInputQuery = z.output<typeof voiceInputQuerySchema>;

const customDataSchema = z.looseObject({ incidentId: z.uuid() });

export function incidentIdFromCustomData(value: unknown): string | null {
  let data = value;

  if (typeof value === 'string') {
    try {
      data = JSON.parse(value);
    } catch {
      return null;
    }
  }

  const result = customDataSchema.safeParse(data);

  return result.success ? result.data.incidentId : null;
}
