import type { Actor } from './incident-event.js';
import type { IncidentStatus } from './incident.js';

export const INCIDENT_TRANSITIONS: Readonly<Record<IncidentStatus, readonly IncidentStatus[]>> = {
  open: ['notified', 'escalated'],
  notified: ['in_mediation', 'escalated'],
  in_mediation: ['resolved', 'escalated'],
  escalated: ['resolved'],
  resolved: [],
};

export const TRANSITION_ACTORS: Readonly<Record<IncidentStatus, readonly Actor[]>> = {
  open: [],
  notified: ['system'],
  in_mediation: ['system', 'agent', 'driver'],
  resolved: ['agent'],
  escalated: ['agent', 'system'],
};

export function allowedTransitions(from: IncidentStatus, actor?: Actor): readonly IncidentStatus[] {
  return INCIDENT_TRANSITIONS[from].filter(
    (to) => actor === undefined || TRANSITION_ACTORS[to].includes(actor),
  );
}

export function canTransition(from: IncidentStatus, to: IncidentStatus, actor?: Actor): boolean {
  return allowedTransitions(from, actor).includes(to);
}
