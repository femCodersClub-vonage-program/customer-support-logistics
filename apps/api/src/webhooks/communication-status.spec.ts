import { describe, expect, it } from 'vitest';

import { advancesStatus, fromMessageStatus, fromVoiceStatus } from './communication-status.js';

describe('fromMessageStatus', () => {
  it.each([
    ['submitted', 'in_progress'],
    ['delivered', 'completed'],
    ['rejected', 'failed'],
    ['undeliverable', 'failed'],
  ])('maps %s to %s', (status, expected) => {
    expect(fromMessageStatus(status)).toBe(expected);
  });

  it.each(['read', 'unknown', 'constructor'])('ignores %s', (status) => {
    expect(fromMessageStatus(status)).toBeNull();
  });
});

describe('fromVoiceStatus', () => {
  it.each([
    ['started', 'queued'],
    ['ringing', 'queued'],
    ['answered', 'in_progress'],
    ['completed', 'completed'],
    ['busy', 'failed'],
    ['cancelled', 'failed'],
    ['unanswered', 'failed'],
    ['rejected', 'failed'],
    ['failed', 'failed'],
    ['timeout', 'failed'],
  ])('maps %s to %s', (status, expected) => {
    expect(fromVoiceStatus(status)).toBe(expected);
  });

  it.each(['human', 'machine', 'disconnected', 'transfer'])('ignores %s', (status) => {
    expect(fromVoiceStatus(status)).toBeNull();
  });
});

describe('advancesStatus', () => {
  it.each([
    ['queued', 'in_progress', true],
    ['queued', 'failed', true],
    ['in_progress', 'completed', true],
    ['in_progress', 'queued', false],
    ['completed', 'failed', false],
    ['failed', 'completed', false],
    ['completed', 'completed', false],
  ] as const)('%s → %s advances: %s', (current, next, expected) => {
    expect(advancesStatus(current, next)).toBe(expected);
  });
});
