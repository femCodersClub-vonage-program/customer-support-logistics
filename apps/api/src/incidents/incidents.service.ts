import { UNASSIGNED_AGENT } from '@csl/contracts';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, lte, or, sql } from 'drizzle-orm';

import { requireCustomerId } from '../common/dev-auth/dev-actor.js';
import { DATABASE } from '../database/database.constants.js';
import {
  communications,
  customers,
  drivers,
  incidentEvents,
  incidents,
  orders,
  routes,
} from '../database/schema/index.js';
import { singleRow } from '../database/single-row.js';
import { toOrder } from '../orders/orders.mapper.js';

import { toIncident, toIncidentDetail, toIncidentListItem } from './incidents.mapper.js';
import { persistTransition } from './persist-transition.js';

import type { DevActor } from '../common/dev-auth/dev-actor.js';
import type { Database } from '../database/database.constants.js';
import type {
  ChangeIncidentStatusBody,
  CreateIncidentBody,
  IncidentDetail,
  ListIncidentsQuery,
  ListIncidentsResponse,
} from '@csl/contracts';
import type { Incident } from '@csl/shared-types';
import type { SQL } from 'drizzle-orm';

const INCIDENT_NOT_FOUND = 'Incident not found';

// Typed against the contract so that adding a status without updating this
// object fails to compile.
const NO_INCIDENTS_PER_STATUS: ListIncidentsResponse['statusCounts'] = {
  open: 0,
  notified: 0,
  in_mediation: 0,
  resolved: 0,
  escalated: 0,
};

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

function ownedBy(actor: DevActor): SQL | undefined {
  return actor.role === 'customer' ? eq(orders.customerId, actor.id) : undefined;
}

function listFilters(
  query: ListIncidentsQuery,
  { includeStatus = true }: { includeStatus?: boolean } = {},
): SQL | undefined {
  const conditions: (SQL | undefined)[] = [];

  if (includeStatus && query.status !== undefined) {
    conditions.push(inArray(incidents.status, query.status));
  }

  if (query.type !== undefined) {
    conditions.push(eq(incidents.type, query.type));
  }

  if (query.agentId === UNASSIGNED_AGENT) {
    conditions.push(isNull(incidents.agentId));
  } else if (query.agentId !== undefined) {
    conditions.push(eq(incidents.agentId, query.agentId));
  }

  if (query.createdFrom !== undefined) {
    conditions.push(gte(incidents.createdAt, new Date(query.createdFrom)));
  }

  if (query.createdTo !== undefined) {
    conditions.push(lte(incidents.createdAt, new Date(query.createdTo)));
  }

  if (query.q !== undefined) {
    const pattern = `%${escapeLike(query.q)}%`;

    conditions.push(
      or(
        ilike(sql`${orders.id}::text`, pattern),
        ilike(customers.name, pattern),
        ilike(customers.phone, pattern),
      ),
    );
  }

  return and(...conditions);
}

@Injectable()
export class IncidentsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async create(actor: DevActor, body: CreateIncidentBody): Promise<Incident> {
    const customerId = requireCustomerId(actor);

    return this.db.transaction(async (tx) => {
      const [order] = await tx
        .select({ id: orders.id })
        .from(orders)
        .where(and(eq(orders.id, body.orderId), eq(orders.customerId, customerId)));

      if (!order) {
        throw new NotFoundException('Order not found');
      }

      const incident = singleRow(
        await tx.insert(incidents).values({ orderId: order.id, type: body.type }).returning(),
      );

      await tx.insert(incidentEvents).values({
        incidentId: incident.id,
        fromStatus: null,
        toStatus: incident.status,
        actor: 'customer',
        actorId: customerId,
        occurredAt: incident.createdAt,
      });

      return toIncident(incident);
    });
  }

  async list(query: ListIncidentsQuery): Promise<ListIncidentsResponse> {
    const where = listFilters(query);
    const countsWhere = listFilters(query, { includeStatus: false });
    const direction = query.order === 'asc' ? asc : desc;
    const sortColumn = query.sort === 'updatedAt' ? incidents.updatedAt : incidents.createdAt;

    const [rows, totals, perStatus] = await Promise.all([
      this.db
        .select({ incident: incidents, customer: { id: customers.id, name: customers.name } })
        .from(incidents)
        .innerJoin(orders, eq(orders.id, incidents.orderId))
        .innerJoin(customers, eq(customers.id, orders.customerId))
        .where(where)
        .orderBy(direction(sortColumn), direction(incidents.id))
        .limit(query.limit)
        .offset(query.offset),
      this.db
        .select({ total: count() })
        .from(incidents)
        .innerJoin(orders, eq(orders.id, incidents.orderId))
        .innerJoin(customers, eq(customers.id, orders.customerId))
        .where(where),
      this.db
        .select({ status: incidents.status, total: count() })
        .from(incidents)
        .innerJoin(orders, eq(orders.id, incidents.orderId))
        .innerJoin(customers, eq(customers.id, orders.customerId))
        .where(countsWhere)
        .groupBy(incidents.status),
    ]);

    const statusCounts = { ...NO_INCIDENTS_PER_STATUS };

    for (const { status, total } of perStatus) {
      statusCounts[status] = total;
    }

    return {
      items: rows.map(({ incident, customer }) => toIncidentListItem(incident, customer)),
      total: singleRow(totals).total,
      limit: query.limit,
      offset: query.offset,
      statusCounts,
    };
  }

  async findOne(actor: DevActor, id: string): Promise<IncidentDetail> {
    const [row] = await this.db
      .select({ incident: incidents, order: orders, customer: customers, driver: drivers })
      .from(incidents)
      .innerJoin(orders, eq(orders.id, incidents.orderId))
      .innerJoin(customers, eq(customers.id, orders.customerId))
      .leftJoin(routes, eq(routes.id, orders.routeId))
      .leftJoin(drivers, eq(drivers.id, routes.driverId))
      .where(and(eq(incidents.id, id), ownedBy(actor)));

    if (!row) {
      throw new NotFoundException(INCIDENT_NOT_FOUND);
    }

    const [events, incidentCommunications] = await Promise.all([
      this.db
        .select()
        .from(incidentEvents)
        .where(eq(incidentEvents.incidentId, id))
        .orderBy(asc(incidentEvents.occurredAt), asc(incidentEvents.id)),
      this.db
        .select()
        .from(communications)
        .where(eq(communications.incidentId, id))
        .orderBy(asc(communications.createdAt), asc(communications.id)),
    ]);

    return toIncidentDetail({
      incident: row.incident,
      order: toOrder(row.order),
      customer: row.customer,
      driver: row.driver,
      events,
      communications: incidentCommunications,
    });
  }

  async changeStatus(
    actor: DevActor,
    id: string,
    body: ChangeIncidentStatusBody,
  ): Promise<Incident> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .select({ incident: incidents })
        .from(incidents)
        .innerJoin(orders, eq(orders.id, incidents.orderId))
        .where(and(eq(incidents.id, id), ownedBy(actor)))
        .for('update', { of: incidents });

      if (!row) {
        throw new NotFoundException(INCIDENT_NOT_FOUND);
      }

      const updated = await persistTransition(tx, row.incident, {
        to: body.status,
        actor: actor.role,
        actorId: actor.id,
        reason: body.reason,
      });

      return toIncident(updated);
    });
  }
}