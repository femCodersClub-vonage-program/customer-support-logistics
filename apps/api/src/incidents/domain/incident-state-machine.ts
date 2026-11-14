import { randomUUID } from 'node:crypto';

import { INCIDENT_TRANSITIONS, TRANSITION_ACTORS } from '@csl/shared-types';

import { InvalidTransitionError, UnauthorizedTransitionError } from './transition.errors.js';

import type { Actor, Incident, IncidentEvent, IncidentStatus } from '@csl/shared-types';

export interface TransitionCommand {
  to: IncidentStatus;
  actor: Actor;
  actorId?: string;
  reason?: string;
}

export interface TransitionDeps {
  now: () => Date;
  generateId: () => string;
}

export interface TransitionResult {
  incident: Incident;
  event: IncidentEvent;
}

const defaultDeps: TransitionDeps = {
  now: () => new Date(),
  generateId: randomUUID,
};

export function transition(
  incident: Incident,
  command: TransitionCommand,
  deps: TransitionDeps = defaultDeps,
): TransitionResult {
  const { to, actor, actorId = null, reason = null } = command;
  const from = incident.status;

  if (!INCIDENT_TRANSITIONS[from].includes(to)) {
    throw new InvalidTransitionError(from, to);
  }

  if (!TRANSITION_ACTORS[to].includes(actor)) {
    throw new UnauthorizedTransitionError(to, actor);
  }

  const occurredAt = deps.now().toISOString();
  const updated: Incident = { ...incident, status: to };

  if (to === 'resolved') {
    updated.closedAt = occurredAt;
    updated.resolution = reason ?? incident.resolution;
  }

  return {
    incident: updated,
    event: {
      id: deps.generateId(),
      incidentId: incident.id,
      fromStatus: from,
      toStatus: to,
      actor,
      actorId,
      reason,
      occurredAt,
    },
  };
}
