import { ACTORS, INCIDENT_STATUSES } from '@csl/shared-types';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { transition } from './incident-state-machine.js';
import { InvalidTransitionError, UnauthorizedTransitionError } from './transition.errors.js';

import type { TransitionDeps } from './incident-state-machine.js';
import type { Actor, Incident, IncidentStatus } from '@csl/shared-types';

const VALID_TRANSITIONS: ReadonlyArray<[IncidentStatus, IncidentStatus]> = [
  ['open', 'notified'],
  ['open', 'escalated'],
  ['notified', 'in_mediation'],
  ['notified', 'escalated'],
  ['in_mediation', 'resolved'],
  ['in_mediation', 'escalated'],
  ['escalated', 'resolved'],
];

const ALLOWED_ACTORS: Readonly<Record<IncidentStatus, readonly Actor[]>> = {
  open: [],
  notified: ['system'],
  in_mediation: ['system', 'agent'],
  resolved: ['agent'],
  escalated: ['agent', 'system'],
};

const isValid = (from: IncidentStatus, to: IncidentStatus) =>
  VALID_TRANSITIONS.some(([validFrom, validTo]) => validFrom === from && validTo === to);

const ALL_PAIRS = INCIDENT_STATUSES.flatMap((from) =>
  INCIDENT_STATUSES.map((to): [IncidentStatus, IncidentStatus] => [from, to]),
);

const INVALID_TRANSITIONS = ALL_PAIRS.filter(([from, to]) => !isValid(from, to));

const AUTHORIZED_CASES = VALID_TRANSITIONS.flatMap(([from, to]) =>
  ALLOWED_ACTORS[to].map((actor): [IncidentStatus, IncidentStatus, Actor] => [from, to, actor]),
);

const UNAUTHORIZED_CASES = VALID_TRANSITIONS.flatMap(([from, to]) =>
  ACTORS.filter((actor) => !ALLOWED_ACTORS[to].includes(actor)).map(
    (actor): [IncidentStatus, IncidentStatus, Actor] => [from, to, actor],
  ),
);

const NOW = '2026-11-08T10:00:00.000Z';

const deps: TransitionDeps = {
  now: () => new Date(NOW),
  generateId: () => 'event-1',
};

const buildIncident = (status: IncidentStatus, overrides: Partial<Incident> = {}): Incident => ({
  id: 'incident-1',
  orderId: 'order-1',
  type: 'delayed',
  status,
  agentId: null,
  resolution: null,
  createdAt: '2026-11-01T09:00:00.000Z',
  closedAt: null,
  ...overrides,
});

describe('transition', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('covers every (from, to) pair', () => {
    expect(ALL_PAIRS).toHaveLength(25);
    expect(VALID_TRANSITIONS.length + INVALID_TRANSITIONS.length).toBe(25);
  });

  it.each(AUTHORIZED_CASES)('moves %s → %s when the actor is %s', (from, to, actor) => {
    const result = transition(buildIncident(from), { to, actor, actorId: 'actor-1' }, deps);

    expect(result.incident.status).toBe(to);
    expect(result.event).toEqual({
      id: 'event-1',
      incidentId: 'incident-1',
      fromStatus: from,
      toStatus: to,
      actor,
      actorId: 'actor-1',
      reason: null,
      occurredAt: NOW,
    });
  });

  it.each(INVALID_TRANSITIONS)('rejects %s → %s with InvalidTransitionError', (from, to) => {
    const act = () => transition(buildIncident(from), { to, actor: 'agent' }, deps);

    expect(act).toThrow(InvalidTransitionError);
    expect(act).toThrow(expect.objectContaining({ from, to }));
  });

  it.each(UNAUTHORIZED_CASES)(
    'rejects %s → %s with UnauthorizedTransitionError when the actor is %s',
    (from, to, actor) => {
      const act = () => transition(buildIncident(from), { to, actor }, deps);

      expect(act).toThrow(UnauthorizedTransitionError);
      expect(act).toThrow(expect.objectContaining({ to, actor }));
    },
  );

  it.each(ACTORS)('rejects an impossible transition as invalid even for %s', (actor) => {
    expect(() => transition(buildIncident('resolved'), { to: 'open', actor }, deps)).toThrow(
      InvalidTransitionError,
    );
  });

  it.each(['in_mediation', 'escalated'] as const)(
    'closes the incident with the reason as resolution when resolving from %s',
    (from) => {
      const { incident, event } = transition(
        buildIncident(from),
        { to: 'resolved', actor: 'agent', reason: 'Refund issued' },
        deps,
      );

      expect(incident).toEqual(
        buildIncident('resolved', { closedAt: NOW, resolution: 'Refund issued' }),
      );
      expect(event.reason).toBe('Refund issued');
    },
  );

  it('keeps the previous resolution when resolving without a reason', () => {
    const { incident } = transition(
      buildIncident('in_mediation', { resolution: 'Driver will redeliver' }),
      { to: 'resolved', actor: 'agent' },
      deps,
    );

    expect(incident.resolution).toBe('Driver will redeliver');
    expect(incident.closedAt).toBe(NOW);
  });

  it('records the reason on the event without closing the incident when escalating', () => {
    const { incident, event } = transition(
      buildIncident('notified'),
      { to: 'escalated', actor: 'agent', reason: 'Driver unreachable' },
      deps,
    );

    expect(incident).toEqual(buildIncident('escalated'));
    expect(event.reason).toBe('Driver unreachable');
  });

  it('does not mutate the original incident', () => {
    const original = buildIncident('in_mediation');
    const snapshot = structuredClone(original);

    transition(original, { to: 'resolved', actor: 'agent', reason: 'Refund issued' }, deps);

    expect(original).toEqual(snapshot);
  });

  it('defaults actorId and reason to null', () => {
    const { event } = transition(buildIncident('open'), { to: 'notified', actor: 'system' }, deps);

    expect(event.actorId).toBeNull();
    expect(event.reason).toBeNull();
  });

  it('uses the current time and a random UUID by default', () => {
    vi.useFakeTimers({ now: new Date(NOW) });

    const { event } = transition(buildIncident('open'), { to: 'notified', actor: 'system' });

    expect(event.occurredAt).toBe(NOW);
    expect(event.id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('transition errors', () => {
  it('describes an invalid transition', () => {
    const error = new InvalidTransitionError('resolved', 'open');

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('InvalidTransitionError');
    expect(error.message).toBe('Cannot transition incident from "resolved" to "open"');
  });

  it('describes an unauthorized transition', () => {
    const error = new UnauthorizedTransitionError('resolved', 'driver');

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('UnauthorizedTransitionError');
    expect(error.message).toBe('Actor "driver" cannot transition incident to "resolved"');
  });
});
