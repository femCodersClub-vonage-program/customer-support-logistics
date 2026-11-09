import type { Actor, IncidentStatus } from '@csl/shared-types';

export class InvalidTransitionError extends Error {
  override readonly name = 'InvalidTransitionError';
  readonly from: IncidentStatus;
  readonly to: IncidentStatus;

  constructor(from: IncidentStatus, to: IncidentStatus) {
    super(`Cannot transition incident from "${from}" to "${to}"`);
    this.from = from;
    this.to = to;
  }
}

export class UnauthorizedTransitionError extends Error {
  override readonly name = 'UnauthorizedTransitionError';
  readonly to: IncidentStatus;
  readonly actor: Actor;

  constructor(to: IncidentStatus, actor: Actor) {
    super(`Actor "${actor}" cannot transition incident to "${to}"`);
    this.to = to;
    this.actor = actor;
  }
}
