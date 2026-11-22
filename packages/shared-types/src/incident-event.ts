import type { IncidentStatus } from './incident.js';

export const ACTORS = ['customer', 'agent', 'driver', 'system'] as const;

export type Actor = (typeof ACTORS)[number];

export const INCIDENT_EVENT_KINDS = [
  'status_changed',
  'evidence_uploaded',
  'assigned',
  'driver_notification_resent',
] as const;

export type IncidentEventKind = (typeof INCIDENT_EVENT_KINDS)[number];

export interface IncidentEvent {
  id: string;
  incidentId: string;
  kind: IncidentEventKind;
  fromStatus: IncidentStatus | null;
  toStatus: IncidentStatus;
  actor: Actor;
  actorId: string | null;
  reason: string | null;
  occurredAt: string;
}
