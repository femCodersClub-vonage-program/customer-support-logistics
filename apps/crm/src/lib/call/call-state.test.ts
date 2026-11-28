import { describe, expect, it } from 'vitest';

import { callReducer, initialCallState, isCallActive } from './call-state';

import type { CallAction, CallState } from './call-state';

function run(...actions: CallAction[]): CallState {
  return actions.reduce(callReducer, initialCallState);
}

describe('callReducer', () => {
  it('starts connecting when the agent joins', () => {
    expect(run({ type: 'join' }).status).toBe('connecting');
  });

  it('keeps connecting while the call is placed and rings', () => {
    expect(
      run({ type: 'join' }, { type: 'placed', callId: 'c1' }, { type: 'leg', status: 'RINGING' }),
    ).toEqual({
      status: 'connecting',
      callId: 'c1',
      failure: null,
    });
  });

  it('is connected when the leg is answered', () => {
    expect(run({ type: 'join' }, { type: 'leg', status: 'ANSWERED' }).status).toBe('connected');
  });

  it('goes to reconnecting and back only from connected', () => {
    const connected = run({ type: 'join' }, { type: 'leg', status: 'ANSWERED' });

    expect(callReducer(connected, { type: 'reconnecting' }).status).toBe('reconnecting');
    expect(
      callReducer(callReducer(connected, { type: 'reconnecting' }), { type: 'reconnected' }).status,
    ).toBe('connected');
    expect(run({ type: 'join' }, { type: 'reconnecting' }).status).toBe('connecting');
  });

  it.each(['COMPLETED', 'FAILED', 'BUSY', 'TIMEOUT', 'CANCELLED', 'REJECTED'] as const)(
    'ends when the leg is %s',
    (status) => {
      expect(run({ type: 'join' }, { type: 'leg', status }).status).toBe('ended');
    },
  );

  it('ends when the call is hung up', () => {
    expect(run({ type: 'join' }, { type: 'ended' }).status).toBe('ended');
  });

  it('fails with a reason', () => {
    expect(run({ type: 'join' }, { type: 'failed', failure: 'microphone_denied' })).toMatchObject({
      status: 'failed',
      failure: 'microphone_denied',
    });
  });

  it('ignores events once the call is over, and lets the agent join again', () => {
    const ended = run({ type: 'join' }, { type: 'ended' });

    expect(callReducer(ended, { type: 'reconnecting' })).toBe(ended);
    expect(callReducer(ended, { type: 'join' }).status).toBe('connecting');
  });

  it('does not restart a call in progress', () => {
    const connected = run({ type: 'join' }, { type: 'leg', status: 'ANSWERED' });

    expect(callReducer(connected, { type: 'join' })).toBe(connected);
  });

  it('tells which statuses are active', () => {
    expect(['idle', 'ended', 'failed'].some((status) => isCallActive(status as never))).toBe(false);
    expect(['connecting', 'connected', 'reconnecting'].every((s) => isCallActive(s as never))).toBe(
      true,
    );
  });
});
