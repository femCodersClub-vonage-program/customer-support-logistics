import type { IncidentStatus } from './incident.js';

export const INCIDENT_STREAM_EVENT_TYPES = [
  'incident.created',
  'incident.status_changed',
  'incident.assigned',
  'incident.evidence_added',
  'incident.communication_added',
  'incident.communication_updated',
] as const;

export type IncidentStreamEventType = (typeof INCIDENT_STREAM_EVENT_TYPES)[number];

export interface IncidentStreamEvent {
  type: IncidentStreamEventType;
  incidentId: string;
  status?: IncidentStatus;
  updatedAt: string;
}
