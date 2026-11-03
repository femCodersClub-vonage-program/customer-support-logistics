export const INCIDENT_STATUSES = [
  'open',
  'notified',
  'in_mediation',
  'resolved',
  'escalated',
] as const;

export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export const INCIDENT_TYPES = [
  'not_delivered',
  'delayed',
  'damaged',
  'wrong_item',
  'other',
] as const;

export type IncidentType = (typeof INCIDENT_TYPES)[number];

export interface Incident {
  id: string;
  orderId: string;
  type: IncidentType;
  status: IncidentStatus;
  agentId: string | null;
  resolution: string | null;
  createdAt: string;
  closedAt: string | null;
}
