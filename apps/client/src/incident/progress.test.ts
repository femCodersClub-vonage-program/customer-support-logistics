import { describe, expect, it } from 'vitest';

import { canJoinCall, nextStepMessage, progressSteps } from './progress.ts';

const INVITE = { url: 'https://client.test/call/1', sentAt: '2026-11-20T10:00:00.000Z' };

describe('progressSteps', () => {
  it.each([
    ['open', ['current', 'upcoming', 'upcoming', 'upcoming']],
    ['notified', ['done', 'current', 'upcoming', 'upcoming']],
    ['in_mediation', ['done', 'done', 'current', 'upcoming']],
    ['resolved', ['done', 'done', 'done', 'current']],
    ['escalated', ['done', 'done', 'done', 'current']],
  ] as const)('marks the steps of a %s incident', (status, states) => {
    expect(progressSteps(status).map((step) => step.state)).toEqual(states);
  });

  it('ends in resolved unless the incident was escalated', () => {
    expect(progressSteps('notified').map((step) => step.id)).toEqual([
      'reported',
      'notified',
      'in_mediation',
      'resolved',
    ]);
    expect(progressSteps('escalated').at(-1)?.id).toBe('escalated');
  });
});

describe('canJoinCall', () => {
  it('lets the customer join only while in mediation with an invite', () => {
    expect(canJoinCall({ status: 'in_mediation', mediationInvite: INVITE })).toBe(true);
    expect(canJoinCall({ status: 'in_mediation', mediationInvite: null })).toBe(false);
    expect(canJoinCall({ status: 'resolved', mediationInvite: INVITE })).toBe(false);
  });
});

describe('nextStepMessage', () => {
  it('tells the customer the call is ready when they can join it', () => {
    expect(nextStepMessage({ status: 'in_mediation', mediationInvite: INVITE })).toBe(
      'in_mediation_call',
    );
    expect(nextStepMessage({ status: 'in_mediation', mediationInvite: null })).toBe('in_mediation');
    expect(nextStepMessage({ status: 'open', mediationInvite: null })).toBe('open');
  });
});
