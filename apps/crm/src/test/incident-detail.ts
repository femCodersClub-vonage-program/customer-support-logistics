import type { IncidentDetail } from '@csl/contracts';
import type { Communication, IncidentEvent } from '@csl/shared-types';

export const INCIDENT_ID = '6f1e2d3c-4b5a-4987-8a6b-5c4d3e2f1a0b';

export function buildEvent(overrides: Partial<IncidentEvent> = {}): IncidentEvent {
  return {
    id: '1a2b3c4d-0000-4000-8000-000000000001',
    incidentId: INCIDENT_ID,
    fromStatus: 'open',
    toStatus: 'notified',
    actor: 'system',
    actorId: null,
    reason: null,
    occurredAt: '2026-11-13T10:00:00.000Z',
    ...overrides,
  };
}

export function buildCommunication(overrides: Partial<Communication> = {}): Communication {
  return {
    id: '2b3c4d5e-0000-4000-8000-000000000001',
    incidentId: INCIDENT_ID,
    channel: 'voice',
    direction: 'outbound',
    fromNumber: '+34600000000',
    toNumber: '+34611111111',
    vonageUuid: 'call-1',
    status: 'queued',
    durationSeconds: null,
    ...overrides,
  };
}

export function buildIncidentDetail(overrides: Partial<IncidentDetail> = {}): IncidentDetail {
  return {
    id: INCIDENT_ID,
    orderId: '3c4d5e6f-0000-4000-8000-000000000001',
    type: 'not_delivered',
    status: 'notified',
    agentId: null,
    resolution: null,
    createdAt: '2026-11-13T09:00:00.000Z',
    updatedAt: '2026-11-13T10:00:00.000Z',
    closedAt: null,
    order: {
      id: '3c4d5e6f-0000-4000-8000-000000000001',
      customerId: '4d5e6f70-0000-4000-8000-000000000001',
      routeId: null,
      address: 'Calle Mayor 1, Madrid',
      status: 'in_transit',
    },
    customer: {
      id: '4d5e6f70-0000-4000-8000-000000000001',
      name: 'Ana López',
      phone: '+34611111111',
      locale: 'es',
    },
    driver: { id: '5e6f7081-0000-4000-8000-000000000001', name: 'Luis Pérez' },
    events: [buildEvent()],
    communications: [],
    ...overrides,
  };
}
