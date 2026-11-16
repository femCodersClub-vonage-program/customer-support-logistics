import { ApiError } from '@csl/api-client';
import { describe, expect, it } from 'vitest';

import { buildCommunication, buildEvent } from '../test/incident-detail';

import {
  isDriverReplyReason,
  isMediationOutcome,
  latestDriverCall,
  latestDriverReply,
  outcomeToStatusBody,
  toMediationError,
} from './mediation';

function apiError(status: number, code?: string) {
  return new ApiError(
    'failed',
    status,
    code === undefined ? undefined : { error: { code, message: 'x' } },
  );
}

describe('latestDriverCall', () => {
  it('returns the last outbound voice communication', () => {
    const first = buildCommunication({ id: 'a', status: 'failed' });
    const last = buildCommunication({ id: 'b', status: 'in_progress' });
    const sms = buildCommunication({ id: 'c', channel: 'sms' });
    const inbound = buildCommunication({ id: 'd', direction: 'inbound' });

    expect(latestDriverCall([first, last, sms, inbound])).toBe(last);
  });

  it('returns undefined when the driver was never called', () => {
    expect(latestDriverCall([buildCommunication({ channel: 'sms' })])).toBeUndefined();
  });
});

describe('latestDriverReply', () => {
  it('returns the last driver event with a reason', () => {
    const reply = buildEvent({ id: 'b', actor: 'driver', reason: 'customer_not_home' });

    expect(
      latestDriverReply([
        buildEvent({ id: 'a', actor: 'driver', reason: 'delivered' }),
        reply,
        buildEvent({ id: 'c', actor: 'agent', reason: 'note' }),
        buildEvent({ id: 'd', actor: 'driver', reason: null }),
      ]),
    ).toBe(reply);
  });
});

describe('guards', () => {
  it('recognises the mediation outcomes', () => {
    expect(isMediationOutcome('follow_up_needed')).toBe(true);
    expect(isMediationOutcome('open')).toBe(false);
    expect(isMediationOutcome(null)).toBe(false);
  });

  it('recognises the known driver replies', () => {
    expect(isDriverReplyReason('address_not_found')).toBe(true);
    expect(isDriverReplyReason('something else')).toBe(false);
    expect(isDriverReplyReason(null)).toBe(false);
  });
});

describe('outcomeToStatusBody', () => {
  it('uses the outcome as the status and the trimmed note as the reason', () => {
    expect(outcomeToStatusBody('resolved', '  Delivered to a neighbour ')).toEqual({
      status: 'resolved',
      reason: 'Delivered to a neighbour',
    });
  });

  it('omits the reason when the note is empty', () => {
    expect(outcomeToStatusBody('escalated', '   ')).toEqual({ status: 'escalated' });
  });

  it('escalates a follow-up and keeps the outcome in the reason', () => {
    expect(outcomeToStatusBody('follow_up_needed', 'Call back tomorrow')).toEqual({
      status: 'escalated',
      reason: 'follow_up_needed: Call back tomorrow',
    });
    expect(outcomeToStatusBody('follow_up_needed', '')).toEqual({
      status: 'escalated',
      reason: 'follow_up_needed',
    });
  });
});

describe('toMediationError', () => {
  it.each([
    [apiError(409, 'INVALID_TRANSITION'), 'INVALID_TRANSITION'],
    [apiError(409, 'TRANSITION_NOT_ALLOWED_FOR_ACTOR'), 'INVALID_TRANSITION'],
    [apiError(409, 'CONFLICT'), 'CONFLICT'],
    [apiError(502, 'BAD_GATEWAY'), 'BAD_GATEWAY'],
    [apiError(404), 'NOT_FOUND'],
    [apiError(500, 'INTERNAL_ERROR'), 'UNKNOWN'],
    [new Error('network'), 'UNKNOWN'],
  ])('maps %o to %s', (error, expected) => {
    expect(toMediationError(error)).toBe(expected);
  });
});
