import type { IncidentStatus } from './incident.js';

export const ACTORS = ['customer', 'agent', 'driver', 'system'] as const;

export type Actor = (typeof ACTORS)[number];

export interface IncidentEvent {
  id: string;
  incidentId: string;
  fromStatus: IncidentStatus | null;
  toStatus: IncidentStatus;
  actor: Actor;
  actorId: string | null;
  reason: string | null;
  occurredAt: string;
}
