import { ApiError } from '@csl/api-client';
import { apiErrorResponseSchema } from '@csl/contracts';

import type { ChangeIncidentStatusBody, IncidentDetail } from '@csl/contracts';
import type { IncidentEvent } from '@csl/shared-types';

export const MEDIATION_OUTCOMES = ['resolved', 'escalated', 'follow_up_needed'] as const;

export type MediationOutcome = (typeof MEDIATION_OUTCOMES)[number];

export const MEDIATION_NOTE_MAX_LENGTH = 900;

export const DRIVER_REPLY_REASONS = [
  'delivered',
  'address_not_found',
  'customer_not_home',
  'accepted_call',
] as const;

export type DriverReplyReason = (typeof DRIVER_REPLY_REASONS)[number];

export const MEDIATION_ERRORS = [
  'INVALID_TRANSITION',
  'CONFLICT',
  'BAD_GATEWAY',
  'NOT_FOUND',
  'INVALID_OUTCOME',
  'UNKNOWN',
] as const;

export type MediationError = (typeof MEDIATION_ERRORS)[number];

export interface MediationActionState {
  error: MediationError | null;
}

export const IDLE_STATE: MediationActionState = { error: null };

export function isMediationOutcome(value: unknown): value is MediationOutcome {
  return MEDIATION_OUTCOMES.includes(value as MediationOutcome);
}

export function latestDriverCall(communications: IncidentDetail['communications']) {
  return communications.findLast(
    (communication) => communication.channel === 'voice' && communication.direction === 'outbound',
  );
}

export function latestDriverReply(events: readonly IncidentEvent[]) {
  return events.findLast((event) => event.actor === 'driver' && event.reason !== null);
}

export function isDriverReplyReason(value: string | null): value is DriverReplyReason {
  return DRIVER_REPLY_REASONS.includes(value as DriverReplyReason);
}

export function outcomeToStatusBody(
  outcome: MediationOutcome,
  note: string,
): ChangeIncidentStatusBody {
  const trimmed = note.trim();

  if (outcome === 'follow_up_needed') {
    return {
      status: 'escalated',
      reason: trimmed === '' ? outcome : `${outcome}: ${trimmed}`,
    };
  }

  return { status: outcome, ...(trimmed === '' ? {} : { reason: trimmed }) };
}

export function toMediationError(error: unknown): MediationError {
  if (!(error instanceof ApiError)) {
    return 'UNKNOWN';
  }

  const parsed = apiErrorResponseSchema.safeParse(error.body);
  const code = parsed.success ? parsed.data.error.code : undefined;

  if (code === 'INVALID_TRANSITION' || code === 'TRANSITION_NOT_ALLOWED_FOR_ACTOR') {
    return 'INVALID_TRANSITION';
  }

  if (error.status === 409) {
    return 'CONFLICT';
  }

  if (error.status === 502) {
    return 'BAD_GATEWAY';
  }

  if (error.status === 404) {
    return 'NOT_FOUND';
  }

  return 'UNKNOWN';
}
