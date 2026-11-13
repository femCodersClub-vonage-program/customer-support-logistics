import { INCIDENT_STATUSES, SUPPORTED_LOCALES, canTransition } from '@csl/shared-types';
import { describe, expect, it } from 'vitest';

import { seedData } from './seed-data.js';

const historyOf = (incidentId: string) =>
  seedData.incidentEvents
    .filter((event) => event.incidentId === incidentId)
    .toSorted((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

const customerOf = (orderId: string) =>
  seedData.orders.find((order) => order.id === orderId)?.customerId;

describe('seed data', () => {
  describe.each(seedData.incidents.map((incident) => [incident.id, incident] as const))(
    'incident %s',
    (_id, incident) => {
      const history = historyOf(incident.id);

      it('starts with the customer opening it', () => {
        expect(history[0]).toMatchObject({
          fromStatus: null,
          toStatus: 'open',
          actor: 'customer',
          actorId: customerOf(incident.orderId),
          occurredAt: incident.createdAt,
        });
      });

      it('only uses transitions the state machine allows', () => {
        for (const [index, event] of history.slice(1).entries()) {
          const previous = history[index];

          expect(event.fromStatus).toBe(previous?.toStatus);
          expect(event.occurredAt.getTime()).toBeGreaterThan(previous?.occurredAt.getTime() ?? 0);
          expect(
            event.fromStatus !== null &&
              canTransition(event.fromStatus, event.toStatus, event.actor),
          ).toBe(true);
        }
      });

      it('ends at the incident status and update time', () => {
        expect(history.at(-1)).toMatchObject({
          toStatus: incident.status,
          occurredAt: incident.updatedAt,
        });
      });

      it('is assigned only to an agent that took part in the history', () => {
        const agents = history.filter((event) => event.actor === 'agent').map((e) => e.actorId);

        expect(incident.agentId === null ? [] : [incident.agentId]).toEqual([...new Set(agents)]);
      });

      it('has closing data only when resolved', () => {
        const resolvedEvent = history.find((event) => event.toStatus === 'resolved');

        expect(incident.closedAt).toEqual(resolvedEvent?.occurredAt ?? null);
        expect(incident.resolution).toBe(resolvedEvent?.reason ?? null);
      });
    },
  );

  it('belongs every event to a seeded incident', () => {
    const incidentIds = new Set(seedData.incidents.map((incident) => incident.id));

    expect(seedData.incidentEvents.every((event) => incidentIds.has(event.incidentId))).toBe(true);
  });

  it('covers every incident status', () => {
    expect(new Set(seedData.incidents.map((incident) => incident.status))).toEqual(
      new Set(INCIDENT_STATUSES),
    );
  });

  it('has assigned and unassigned incidents', () => {
    expect(seedData.incidents.some((incident) => incident.agentId === null)).toBe(true);
    expect(seedData.incidents.some((incident) => incident.agentId !== null)).toBe(true);
  });

  it('assigns incidents only to seeded agents', () => {
    const agentIds = new Set(seedData.agents.map((agent) => agent.id));

    expect(
      seedData.incidents.every(
        (incident) => incident.agentId === null || agentIds.has(incident.agentId),
      ),
    ).toBe(true);
  });

  it('has customers in every supported locale', () => {
    expect(new Set(seedData.customers.map((customer) => customer.locale))).toEqual(
      new Set(SUPPORTED_LOCALES),
    );
  });

  it('has orders with and without a route', () => {
    expect(seedData.orders.some((order) => order.routeId == null)).toBe(true);
    expect(seedData.orders.some((order) => order.routeId != null)).toBe(true);
  });
});
