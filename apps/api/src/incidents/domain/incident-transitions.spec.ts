import { allowedTransitions, canTransition } from '@csl/shared-types';
import { describe, expect, it } from 'vitest';

describe('allowedTransitions', () => {
  it.each([
    ['open', ['notified', 'escalated']],
    ['notified', ['in_mediation', 'escalated']],
    ['in_mediation', ['resolved', 'escalated']],
    ['escalated', ['resolved']],
    ['resolved', []],
  ] as const)('lists the targets reachable from %s', (from, expected) => {
    expect(allowedTransitions(from)).toEqual(expected);
  });

  it.each([
    ['in_mediation', 'agent', ['resolved', 'escalated']],
    ['in_mediation', 'system', ['escalated']],
    ['open', 'system', ['notified', 'escalated']],
    ['open', 'agent', ['escalated']],
    ['notified', 'customer', []],
    ['notified', 'driver', ['in_mediation']],
    ['in_mediation', 'driver', []],
    ['escalated', 'driver', []],
  ] as const)('filters the targets from %s by what %s may do', (from, actor, expected) => {
    expect(allowedTransitions(from, actor)).toEqual(expected);
  });
});

describe('canTransition', () => {
  it('accepts a valid transition when no actor is given', () => {
    expect(canTransition('escalated', 'resolved')).toBe(true);
  });

  it('rejects a transition missing from the table', () => {
    expect(canTransition('resolved', 'open')).toBe(false);
  });

  it('accepts a valid transition for an allowed actor', () => {
    expect(canTransition('escalated', 'resolved', 'agent')).toBe(true);
  });

  it('rejects a valid transition for an actor without permission', () => {
    expect(canTransition('escalated', 'resolved', 'system')).toBe(false);
  });
});
