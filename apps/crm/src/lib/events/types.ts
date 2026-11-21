import type { IncidentStatus } from '@csl/shared-types';

export const INCIDENT_EVENT_TYPES = {
  created: 'incident.created',
  statusChanged: 'incident.status_changed',
  assigned: 'incident.assigned',
  evidenceAdded: 'incident.evidence_added',
  communicationAdded: 'incident.communication_added',
} as const;

export type IncidentEventType = (typeof INCIDENT_EVENT_TYPES)[keyof typeof INCIDENT_EVENT_TYPES];

export interface IncidentStreamEvent {
  type: IncidentEventType;
  incidentId: string;
  status?: IncidentStatus;
  updatedAt: string;
}

export type ConnectionState = 'connecting' | 'connected' | 'reconnecting';

export type StreamMessage = { kind: 'event'; event: IncidentStreamEvent } | { kind: 'reconnected' };
