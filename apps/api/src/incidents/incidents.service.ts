import { UNASSIGNED_AGENT } from '@csl/contracts';
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, lte, or, sql } from 'drizzle-orm';

import { requireCustomerId } from '../common/dev-auth/dev-actor.js';
import { DATABASE } from '../database/database.constants.js';
import {
  communications,
  customers,
  drivers,
  evidence,
  incidentEvents,
  incidents,
  orders,
  routes,
} from '../database/schema/index.js';
import { singleRow } from '../database/single-row.js';
import { incidentNoticeSms } from '../i18n/sms-templates.js';
import { toOrder } from '../orders/orders.mapper.js';
import { VONAGE_SERVICE } from '../vonage/vonage.service.js';

import { UnauthorizedTransitionError } from './domain/transition.errors.js';
import { toIncident, toIncidentDetail, toIncidentListItem } from './incidents.mapper.js';
import { persistTransition } from './persist-transition.js';

import type { DevActor } from '../common/dev-auth/dev-actor.js';
import type { Database } from '../database/database.constants.js';
import type { VonageService } from '../vonage/vonage.service.js';
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

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

function ownedBy(actor: DevActor): SQL | undefined {
  return actor.role === 'customer' ? eq(orders.customerId, actor.id) : undefined;
}

function listFilters(query: ListIncidentsQuery): SQL | undefined {
  const conditions: (SQL | undefined)[] = [];

  if (query.status !== undefined) {
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
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(VONAGE_SERVICE) private readonly vonage: VonageService,
  ) {}

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
    const direction = query.order === 'asc' ? asc : desc;
    const sortColumn = query.sort === 'updatedAt' ? incidents.updatedAt : incidents.createdAt;

    const [rows, totals] = await Promise.all([
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
    ]);

    return {
      items: rows.map(({ incident, customer }) => toIncidentListItem(incident, customer)),
      total: singleRow(totals).total,
      limit: query.limit,
      offset: query.offset,
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

    const [events, incidentCommunications, incidentEvidence] = await Promise.all([
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
      this.db
        .select()
        .from(evidence)
        .where(eq(evidence.incidentId, id))
        .orderBy(asc(evidence.createdAt), asc(evidence.id)),
    ]);

    return toIncidentDetail({
      incident: row.incident,
      order: toOrder(row.order),
      customer: row.customer,
      driver: row.driver,
      events,
      communications: incidentCommunications,
      evidence: incidentEvidence,
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

      if (actor.role === 'agent' && body.status === 'notified') {
        throw new UnauthorizedTransitionError('notified', actor.role);
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

  async assignToMe(actor: DevActor, id: string): Promise<Incident> {
    if (actor.role !== 'agent') {
      throw new ForbiddenException('Only agents can assign incidents');
    }

    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .select({ incident: incidents })
        .from(incidents)
        .where(eq(incidents.id, id))
        .for('update');

      if (!row) {
        throw new NotFoundException(INCIDENT_NOT_FOUND);
      }

      const updated = singleRow(
        await tx
          .update(incidents)
          .set({ agentId: actor.id })
          .where(eq(incidents.id, id))
          .returning(),
      );

      return toIncident(updated);
    });
  }

  async notifyDriverAgain(
    actor: DevActor,
    id: string,
    idempotencyKey: string,
  ): Promise<Incident> {
    if (actor.role !== 'agent') {
      throw new ForbiddenException('Only agents can notify drivers');
    }

    if (!idempotencyKey?.trim() || idempotencyKey.length > 255) {
      throw new ConflictException('A valid Idempotency-Key is required');
    }

    return this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${idempotencyKey}))`);

      const [row] = await tx
        .select({
          incident: incidents,
          order: orders,
          driver: drivers,
        })
        .from(incidents)
        .innerJoin(orders, eq(orders.id, incidents.orderId))
        .leftJoin(routes, eq(routes.id, orders.routeId))
        .leftJoin(drivers, eq(drivers.id, routes.driverId))
        .where(eq(incidents.id, id))
        .for('update', { of: incidents });

      if (!row) {
        throw new NotFoundException(INCIDENT_NOT_FOUND);
      }

      const [existingCommunication] = await tx
        .select()
        .from(communications)
        .where(eq(communications.idempotencyKey, idempotencyKey))
        .limit(1);

      if (existingCommunication) {
        if (existingCommunication.incidentId !== id) {
          throw new ConflictException('Idempotency key already used');
        }

        return toIncident(row.incident);
      }

      if (row.incident.status !== 'notified') {
        throw new ConflictException('Incident is not notified');
      }

      if (!row.driver) {
        throw new ConflictException('Incident has no assigned driver');
      }

      const message = incidentNoticeSms(row.driver.locale, {
        orderId: row.order.id,
        incidentType: row.incident.type,
      });

      const sent = await this.vonage.sendSms(row.driver.phone, message);

      await tx.insert(communications).values({
        incidentId: id,
        idempotencyKey,
        channel: 'sms',
        direction: 'outbound',
        fromNumber: null,
        toNumber: row.driver.phone,
        vonageUuid: sent.messageId,
        status: 'queued',
      });

      await tx.insert(incidentEvents).values({
        incidentId: id,
        fromStatus: 'notified',
        toStatus: 'notified',
        actor: 'agent',
        actorId: actor.id,
        reason: 'Driver notification resent',
      });

      return toIncident(row.incident);
    });
  }

  async notifyDriver(actor: DevActor, id: string): Promise<Incident> {
    if (actor.role !== 'agent') {
      throw new ForbiddenException('Only agents can notify drivers');
    }

    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .select({
          incident: incidents,
          order: orders,
          driver: drivers,
        })
        .from(incidents)
        .innerJoin(orders, eq(orders.id, incidents.orderId))
        .leftJoin(routes, eq(routes.id, orders.routeId))
        .leftJoin(drivers, eq(drivers.id, routes.driverId))
        .where(eq(incidents.id, id))
        .for('update', { of: incidents });

      if (!row) {
        throw new NotFoundException(INCIDENT_NOT_FOUND);
      }

      if (row.incident.status !== 'open') {
        throw new ConflictException('Incident is not open');
      }

      if (!row.driver) {
        throw new ConflictException('Incident has no assigned driver');
      }

      const message = incidentNoticeSms(row.driver.locale, {
        orderId: row.order.id,
        incidentType: row.incident.type,
      });

      const sent = await this.vonage.sendSms(row.driver.phone, message);

      await tx.insert(communications).values({
        incidentId: id,
        channel: 'sms',
        direction: 'outbound',
        fromNumber: null,
        toNumber: row.driver.phone,
        vonageUuid: sent.messageId,
        status: 'queued',
      });

      const updated = await persistTransition(tx, row.incident, {
        to: 'notified',
        actor: 'agent',
        actorId: actor.id,
        reason: 'Driver notified by SMS',
      });

      return toIncident(updated);
    });
  }
}
