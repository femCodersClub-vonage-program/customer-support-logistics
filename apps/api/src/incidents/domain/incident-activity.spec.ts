import { describe, expect, it } from 'vitest';

import { createIncidentActivity } from './incident-activity.js';

import type { Incident, IncidentStatus } from '@csl/shared-types';

const NOW = '2026-11-08T10:00:00.000Z';

const buildIncident = (status: IncidentStatus): Incident => ({
  id: 'incident-1',
  orderId: 'order-1',
  type: 'delayed',
  status,
  agentId: null,
  resolution: null,
  createdAt: '2026-11-01T09:00:00.000Z',
  updatedAt: '2026-11-01T09:00:00.000Z',
  closedAt: null,
});

const deps = {
  now: () => new Date(NOW),
  generateId: () => 'event-1',
};

describe('createIncidentActivity', () => {
  it('records an activity without changing the incident status', () => {
    const incident = buildIncident('notified');

    const event = createIncidentActivity(
      incident,
      {
        kind: 'driver_notification_resent',
        actor: 'agent',
        actorId: 'agent-1',
        reason: 'Driver notification resent',
      },
      deps,
    );

    expect(event).toEqual({
      id: 'event-1',
      incidentId: 'incident-1',
      kind: 'driver_notification_resent',
      fromStatus: 'notified',
      toStatus: 'notified',
      actor: 'agent',
      actorId: 'agent-1',
      reason: 'Driver notification resent',
      occurredAt: NOW,
    });
    expect(incident.status).toBe('notified');
  });

  it('defaults actorId and reason to null', () => {
    const event = createIncidentActivity(
      buildIncident('open'),
      { kind: 'driver_notification_resent', actor: 'system' },
      deps,
    );

    expect(event.actorId).toBeNull();
    expect(event.reason).toBeNull();
  });

  it('uses the current time and a random UUID by default', () => {
    const event = createIncidentActivity(buildIncident('notified'), {
      kind: 'driver_notification_resent',
      actor: 'agent',
    });

    expect(event.occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(event.id).toMatch(/^[0-9a-f-]{36}$/);
  });
});
