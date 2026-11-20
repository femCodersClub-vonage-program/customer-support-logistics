import { UNASSIGNED_AGENT } from '@csl/contracts';
import { INCIDENT_STATUSES } from '@csl/shared-types';
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, lte, or, sql } from 'drizzle-orm';

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
  webhookEvents,
} from '../database/schema/index.js';
import { singleRow } from '../database/single-row.js';
import { incidentNoticeSms } from '../i18n/sms-templates.js';
import { toOrder } from '../orders/orders.mapper.js';
import { VonageDisabledError, VonageRequestError } from '../vonage/vonage.errors.js';
import { VONAGE_SERVICE } from '../vonage/vonage.service.js';
import { advancesStatus, fromMessageStatus } from '../webhooks/communication-status.js';
import { messageStatusSchema } from '../webhooks/vonage-payloads.js';

import { UnauthorizedTransitionError } from './domain/transition.errors.js';
import { toIncident, toIncidentDetail, toIncidentListItem } from './incidents.mapper.js';
import { persistTransition } from './persist-transition.js';

import type { AuthActor } from '../auth/auth-actor.js';
import type { Database, DatabaseTransaction } from '../database/database.constants.js';
import type { VonageService } from '../vonage/vonage.service.js';
import type {
  ChangeIncidentStatusBody,
  CreateIncidentBody,
  IncidentDetail,
  IncidentStatusCounts,
  ListIncidentsQuery,
  ListIncidentsResponse,
} from '@csl/contracts';
import type { CommunicationStatus, Incident, IncidentStatus } from '@csl/shared-types';
import type { SQL } from 'drizzle-orm';

const INCIDENT_NOT_FOUND = 'Incident not found';

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

function ownedBy(actor: AuthActor): SQL | undefined {
  return actor.role === 'customer' ? eq(orders.customerId, actor.id) : undefined;
}

function statusFilter(query: ListIncidentsQuery): SQL | undefined {
  return query.status === undefined ? undefined : inArray(incidents.status, query.status);
}

// Every filter except the status one: the counts per status are computed with these.
function otherFilters(query: ListIncidentsQuery): SQL | undefined {
  const conditions: (SQL | undefined)[] = [];

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

function toStatusCounts(rows: { status: IncidentStatus; total: number }[]): IncidentStatusCounts {
  const counts = Object.fromEntries(
    INCIDENT_STATUSES.map((status) => [status, 0]),
  ) as IncidentStatusCounts;

  for (const { status, total } of rows) {
    counts[status] = total;
  }

  return counts;
}

@Injectable()
export class IncidentsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(VONAGE_SERVICE) private readonly vonage: VonageService,
  ) {}

  async create(customerId: string, body: CreateIncidentBody): Promise<Incident> {
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
    const filters = otherFilters(query);
    const direction = query.order === 'asc' ? asc : desc;
    const sortColumn = query.sort === 'updatedAt' ? incidents.updatedAt : incidents.createdAt;

    const [rows, countRows] = await Promise.all([
      this.db
        .select({ incident: incidents, customer: { id: customers.id, name: customers.name } })
        .from(incidents)
        .innerJoin(orders, eq(orders.id, incidents.orderId))
        .innerJoin(customers, eq(customers.id, orders.customerId))
        .where(and(statusFilter(query), filters))
        .orderBy(direction(sortColumn), direction(incidents.id))
        .limit(query.limit)
        .offset(query.offset),
      this.db
        .select({ status: incidents.status, total: count() })
        .from(incidents)
        .innerJoin(orders, eq(orders.id, incidents.orderId))
        .innerJoin(customers, eq(customers.id, orders.customerId))
        .where(filters)
        .groupBy(incidents.status),
    ]);

    const statusCounts = toStatusCounts(countRows);
    const selected = query.status ?? INCIDENT_STATUSES;
    const total = [...new Set(selected)].reduce((sum, status) => sum + statusCounts[status], 0);

    return {
      items: rows.map(({ incident, customer }) => toIncidentListItem(incident, customer)),
      total,
      limit: query.limit,
      offset: query.offset,
      statusCounts,
    };
  }

  async findOne(actor: AuthActor, id: string): Promise<IncidentDetail> {
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
    actor: AuthActor,
    id: string,
    body: ChangeIncidentStatusBody,
  ): Promise<Incident> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .select({ incident: incidents })
        .from(incidents)
        .where(eq(incidents.id, id))
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

  async assignToMe(actor: AuthActor, id: string): Promise<Incident> {
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

      const incident = row.incident;

      if (incident.status === 'resolved') {
        throw new ConflictException('Resolved incidents cannot be assigned');
      }

      if (incident.agentId !== null && incident.agentId !== actor.id) {
        throw new ConflictException('Incident is already assigned to another agent');
      }

      if (incident.agentId === actor.id) {
        return toIncident(incident);
      }

      const updated = singleRow(
        await tx
          .update(incidents)
          .set({ agentId: actor.id })
          .where(eq(incidents.id, id))
          .returning(),
      );

      await tx.insert(incidentEvents).values({
        incidentId: id,
        fromStatus: incident.status,
        toStatus: incident.status,
        actor: 'agent',
        actorId: actor.id,
        reason: 'Incident assigned to agent',
      });

      return toIncident(updated);
    });
  }

  async notifyDriverAgain(actor: AuthActor, id: string, idempotencyKey: string): Promise<Incident> {
    if (actor.role !== 'agent') {
      throw new ForbiddenException('Only agents can notify drivers');
    }

    if (!idempotencyKey?.trim() || idempotencyKey.length > 255) {
      throw new ConflictException('A valid Idempotency-Key is required');
    }

    const reservation = await this.db.transaction(async (tx) => {
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

        return { incident: toIncident(row.incident), existing: true as const };
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

      const [communication] = await tx
        .insert(communications)
        .values({
          incidentId: id,
          idempotencyKey,
          channel: 'sms',
          direction: 'outbound',
          fromNumber: null,
          toNumber: row.driver.phone,
          vonageUuid: null,
          status: 'pending',
        })
        .returning({ id: communications.id });

      return {
        incident: toIncident(row.incident),
        communicationId: communication!.id,
        phone: row.driver.phone,
        message,
        existing: false as const,
      };
    });

    if (reservation.existing) {
      return reservation.incident;
    }

    let sent: Awaited<ReturnType<VonageService['sendSms']>>;

    try {
      sent = await this.vonage.sendSms(reservation.phone, reservation.message);
    } catch (error) {
      const definitelyRejected =
        error instanceof VonageDisabledError ||
        (error instanceof VonageRequestError &&
          error.status !== undefined &&
          error.status >= 400 &&
          error.status < 500);

      if (definitelyRejected) {
        await this.db
          .update(communications)
          .set({ status: 'failed' })
          .where(eq(communications.id, reservation.communicationId));
      }

      throw error;
    }

    await this.db.transaction(async (tx) => {
      await this.attachSmsUuidAndApplyEarlyStatuses(
        tx,
        reservation.communicationId,
        sent.messageId,
      );

      await tx.insert(incidentEvents).values({
        incidentId: id,
        fromStatus: 'notified',
        toStatus: 'notified',
        actor: 'agent',
        actorId: actor.id,
        reason: 'Driver notification resent',
      });
    });

    return reservation.incident;
  }
  async notifyDriver(actor: AuthActor, id: string): Promise<Incident> {
    if (actor.role !== 'agent') {
      throw new ForbiddenException('Only agents can notify drivers');
    }

    const reservation = await this.db.transaction(async (tx) => {
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

      const [pendingCommunication] = await tx
        .select({ id: communications.id })
        .from(communications)
        .where(
          and(
            eq(communications.incidentId, id),
            eq(communications.channel, 'sms'),
            eq(communications.direction, 'outbound'),
            eq(communications.status, 'pending'),
          ),
        )
        .limit(1);

      if (pendingCommunication) {
        throw new ConflictException('Driver notification is already pending');
      }

      const message = incidentNoticeSms(row.driver.locale, {
        orderId: row.order.id,
        incidentType: row.incident.type,
      });

      const [communication] = await tx
        .insert(communications)
        .values({
          incidentId: id,
          channel: 'sms',
          direction: 'outbound',
          fromNumber: null,
          toNumber: row.driver.phone,
          vonageUuid: null,
          status: 'pending',
        })
        .returning({ id: communications.id });

      return {
        incident: toIncident(row.incident),
        communicationId: communication!.id,
        phone: row.driver.phone,
        message,
      };
    });

    let sent: Awaited<ReturnType<VonageService['sendSms']>>;

    try {
      sent = await this.vonage.sendSms(reservation.phone, reservation.message);
    } catch (error) {
      const definitelyRejected =
        error instanceof VonageDisabledError ||
        (error instanceof VonageRequestError &&
          error.status !== undefined &&
          error.status >= 400 &&
          error.status < 500);

      if (definitelyRejected) {
        await this.db
          .update(communications)
          .set({ status: 'failed' })
          .where(eq(communications.id, reservation.communicationId));
      }

      throw error;
    }

    return this.db.transaction(async (tx) => {
      await this.attachSmsUuidAndApplyEarlyStatuses(
        tx,
        reservation.communicationId,
        sent.messageId,
      );

      const [currentIncident] = await tx
        .select()
        .from(incidents)
        .where(eq(incidents.id, id))
        .for('update');

      if (!currentIncident) {
        throw new NotFoundException(INCIDENT_NOT_FOUND);
      }

      if (currentIncident.status !== 'open') {
        return toIncident(currentIncident);
      }

      const updated = await persistTransition(tx, currentIncident, {
        to: 'notified',
        actor: 'agent',
        actorId: actor.id,
        reason: 'Driver notified by SMS',
      });

      return toIncident(updated);
    });
  }
  private async attachSmsUuidAndApplyEarlyStatuses(
    tx: DatabaseTransaction,
    communicationId: string,
    messageId: string,
  ): Promise<void> {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${messageId}))`);

    await tx
      .update(communications)
      .set({ vonageUuid: messageId, status: 'queued' })
      .where(eq(communications.id, communicationId));

    const earlyEvents = await tx
      .select({ id: webhookEvents.id, payload: webhookEvents.payload })
      .from(webhookEvents)
      .where(
        and(
          eq(webhookEvents.source, 'messages_status'),
          isNull(webhookEvents.communicationId),
          sql`${webhookEvents.payload}->>'message_uuid' = ${messageId}`,
        ),
      )
      .orderBy(asc(webhookEvents.receivedAt), asc(webhookEvents.id));

    let currentStatus: CommunicationStatus = 'queued';

    for (const event of earlyEvents) {
      const parsed = messageStatusSchema.safeParse(event.payload);
      if (!parsed.success) {
        continue;
      }

      await tx
        .update(webhookEvents)
        .set({ communicationId })
        .where(eq(webhookEvents.id, event.id));

      const nextStatus = fromMessageStatus(parsed.data.status);
      if (nextStatus !== null && advancesStatus(currentStatus, nextStatus)) {
        currentStatus = nextStatus;
      }
    }

    if (currentStatus !== 'queued') {
      await tx
        .update(communications)
        .set({ status: currentStatus })
        .where(eq(communications.id, communicationId));
    }
  }
}









