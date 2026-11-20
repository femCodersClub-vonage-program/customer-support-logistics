import { randomUUID } from 'node:crypto';

import type { Actor, Incident, IncidentEvent } from '@csl/shared-types';

export interface IncidentActivityCommand {
  actor: Actor;
  actorId?: string;
  reason?: string;
}

export interface IncidentActivityDeps {
  now: () => Date;
  generateId: () => string;
}

const defaultDeps: IncidentActivityDeps = {
  now: () => new Date(),
  generateId: randomUUID,
};

export function createIncidentActivity(
  incident: Incident,
  command: IncidentActivityCommand,
  deps: IncidentActivityDeps = defaultDeps,
): IncidentEvent {
  const { actor, actorId = null, reason = null } = command;

  return {
    id: deps.generateId(),
    incidentId: incident.id,
    fromStatus: incident.status,
    toStatus: incident.status,
    actor,
    actorId,
    reason,
    occurredAt: deps.now().toISOString(),
  };
}
