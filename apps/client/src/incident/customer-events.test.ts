import { describe, expect, it } from 'vitest';

import { customerEvents } from './customer-events.ts';

import type { IncidentEvent } from '@csl/shared-types';

const event = (id: string, overrides: Partial<IncidentEvent>): IncidentEvent => ({
  id,
  incidentId: 'incident-1',
  kind: 'status_changed',
  fromStatus: null,
  toStatus: 'open',
  actor: 'system',
  actorId: null,
  reason: null,
  occurredAt: '2026-11-20T10:00:00.000Z',
  ...overrides,
});

describe('customerEvents', () => {
  it('hides internal events', () => {
    const events = [
      event('created', {}),
      event('resent', { kind: 'driver_notification_resent' }),
      event('replied', { kind: 'driver_replied' }),
      event('unreachable', { kind: 'driver_unreachable' }),
      event('evidence', { kind: 'evidence_uploaded' }),
      event('joined', { kind: 'driver_joined' }),
    ];

    expect(customerEvents(events).map(({ id }) => id)).toEqual(['created', 'evidence', 'joined']);
  });

  it('shows only the first assignment', () => {
    const events = [
      event('first', { kind: 'assigned', occurredAt: '2026-11-20T10:00:00.000Z' }),
      event('second', { kind: 'assigned', occurredAt: '2026-11-20T11:00:00.000Z' }),
    ];

    expect(customerEvents(events).map(({ id }) => id)).toEqual(['first']);
  });

  it('sorts the events from oldest to newest', () => {
    const events = [
      event('later', { occurredAt: '2026-11-21T10:00:00.000Z' }),
      event('earlier', { occurredAt: '2026-11-20T10:00:00.000Z' }),
    ];

    expect(customerEvents(events).map(({ id }) => id)).toEqual(['earlier', 'later']);
  });
});
