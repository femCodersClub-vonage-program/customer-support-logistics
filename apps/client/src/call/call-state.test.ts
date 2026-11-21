import { describe, expect, it } from 'vitest';

import { callReducer, initialCallState, isCallActive } from './call-state.ts';

import type { CallAction, CallState } from './call-state.ts';

const run = (actions: CallAction[], from: CallState = initialCallState) =>
  actions.reduce(callReducer, from);

const placed: CallAction[] = [{ type: 'join' }, { type: 'placed', callId: 'call-1' }];

const connected: CallAction[] = [...placed, { type: 'leg', status: 'ANSWERED', at: 1000 }];

describe('callReducer', () => {
  it('connects, rings once the call is placed and connects when the leg is answered', () => {
    expect(run([{ type: 'join' }]).status).toBe('connecting');
    expect(run(placed)).toMatchObject({ status: 'ringing', callId: 'call-1' });
    expect(run(connected)).toMatchObject({ status: 'connected', connectedAt: 1000 });
  });

  it('rings when the leg rings before the call id arrives', () => {
    expect(run([{ type: 'join' }, { type: 'leg', status: 'RINGING', at: 0 }]).status).toBe(
      'ringing',
    );
  });

  it('keeps the first connection time after reconnecting', () => {
    const state = run([
      ...connected,
      { type: 'reconnecting' },
      { type: 'reconnected' },
      { type: 'leg', status: 'ANSWERED', at: 5000 },
    ]);

    expect(state).toMatchObject({ status: 'connected', connectedAt: 1000 });
  });

  it('only reconnects a connected call', () => {
    expect(run([...connected, { type: 'reconnecting' }]).status).toBe('reconnecting');
    expect(run([...placed, { type: 'reconnecting' }]).status).toBe('ringing');
    expect(run([...connected, { type: 'reconnected' }]).status).toBe('connected');
  });

  it('keeps the muted state', () => {
    expect(run([...connected, { type: 'muted', muted: true }]).muted).toBe(true);
  });

  it.each(['COMPLETED', 'FAILED', 'BUSY', 'TIMEOUT', 'CANCELLED', 'REJECTED'] as const)(
    'ends the call, by the other side, when the leg is %s',
    (status) => {
      expect(run([...connected, { type: 'leg', status, at: 2000 }])).toMatchObject({
        status: 'ended',
        endedBy: 'remote',
      });
    },
  );

  it('ends the call by whoever hung up', () => {
    expect(run([...connected, { type: 'hangup', by: 'local' }]).endedBy).toBe('local');
    expect(run([...connected, { type: 'hangup', by: 'remote' }]).endedBy).toBe('remote');
  });

  it('fails with the reason', () => {
    expect(run([...placed, { type: 'failed', failure: 'no_connection' }])).toMatchObject({
      status: 'failed',
      failure: 'no_connection',
    });
  });

  it('ignores events once the call is over', () => {
    const ended = run([...connected, { type: 'hangup', by: 'local' }]);

    expect(run([{ type: 'hangup', by: 'remote' }], ended).endedBy).toBe('local');
    expect(run([{ type: 'leg', status: 'ANSWERED', at: 0 }], ended).status).toBe('ended');
    expect(run([{ type: 'failed', failure: 'unknown' }], ended).status).toBe('ended');
  });

  it('joins again from scratch after the call is over', () => {
    const failed = run([...placed, { type: 'failed', failure: 'no_connection' }]);

    expect(run([{ type: 'join' }], failed)).toEqual({ ...initialCallState, status: 'connecting' });
  });

  it('does not join again while a call is active', () => {
    const state = run(connected);

    expect(run([{ type: 'join' }], state)).toBe(state);
  });
});

describe('isCallActive', () => {
  it.each([
    ['idle', false],
    ['connecting', true],
    ['ringing', true],
    ['connected', true],
    ['reconnecting', true],
    ['ended', false],
    ['failed', false],
  ] as const)('%s is active: %s', (status, active) => {
    expect(isCallActive(status)).toBe(active);
  });
});
