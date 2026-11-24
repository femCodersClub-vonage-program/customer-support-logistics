import { randomUUID } from 'node:crypto';

import { UNASSIGNED_AGENT } from '@csl/contracts';
import { INCIDENT_STATUSES } from '@csl/shared-types';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, lte, or, sql } from 'drizzle-orm';

import { DATABASE } from '../database/database.constants.js';
import {
  communications,
  customers,
  drivers,
  incidentEvents,
  evidence,
  incidents,
  orders,
  routes,
} from '../database/schema/index.js';
import { singleRow } from '../database/single-row.js';
import { publishIncidentChange, publishIncidentEvent } from '../events/publish-incident-event.js';
import { toOrder } from '../orders/orders.mapper.js';
import { STORAGE_SERVICE } from '../storage/storage.service.js';

import { toIncident, toIncidentDetail, toIncidentListItem } from './incidents.mapper.js';
import { persistTransition } from './persist-transition.js';

import type { AuthActor } from '../auth/auth-actor.js';
import type { Env } from '../config/env.schema.js';
import type { Database, DatabaseTransaction } from '../database/database.constants.js';
import type { StorageService } from '../storage/storage.service.js';
import type {
  ChangeIncidentStatusBody,
  CreateIncidentBody,
  IncidentDetail,
  ListIncidentsQuery,
  ListIncidentsResponse,
  EvidenceUploadUrl,
  EvidenceDownload,
  RequestEvidenceUploadBody,
} from '@csl/contracts';
import type { Incident, IncidentStatus } from '@csl/shared-types';
import type { SQL } from 'drizzle-orm';

const INCIDENT_NOT_FOUND = 'Incident not found';
const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'video/mp4',
  'video/quicktime',
]);

function evidenceExtension(mimeType: string): string {
  return (
    {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/heic': 'heic',
      'video/mp4': 'mp4',
      'video/quicktime': 'mov',
    } as Record<string, string>
  )[mimeType]!;
}

function hasPrefix(bytes: Uint8Array, values: number[]): boolean {
  return values.every((value, index) => bytes[index] === value);
}
function contentMatchesMimeType(bytes: Uint8Array, mimeType: string): boolean {
  if (mimeType === 'image/jpeg') return hasPrefix(bytes, [0xff, 0xd8, 0xff]);
  if (mimeType === 'image/png')
    return hasPrefix(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (mimeType === 'image/webp')
    return (
      hasPrefix(bytes, [0x52, 0x49, 0x46, 0x46]) &&
      String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
    );
  if (mimeType === 'image/heic') return String.fromCharCode(...bytes.slice(4, 12)).includes('heic');
  if (mimeType === 'video/mp4' || mimeType === 'video/quicktime')
    return String.fromCharCode(...bytes.slice(4, 8)) === 'ftyp';
  return false;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

function requireCustomerId(actor: AuthActor): string {
  if (actor.role !== 'customer')
    throw new ForbiddenException('Only customers can perform this action');
  return actor.id;
}

function ownedBy(actor: AuthActor): SQL | undefined {
  return actor.role === 'customer' ? eq(orders.customerId, actor.id) : undefined;
}

function statusFilter(query: ListIncidentsQuery): SQL | undefined {
  return query.status === undefined ? undefined : inArray(incidents.status, query.status);
}

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

@Injectable()
export class IncidentsService {
  private readonly logger = new Logger(IncidentsService.name);
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>,
  ) {}

  async requestEvidenceUpload(
    actor: AuthActor,
    incidentId: string,
    body: RequestEvidenceUploadBody,
  ): Promise<EvidenceUploadUrl> {
    const customerId = requireCustomerId(actor);
    if (!ALLOWED_TYPES.has(body.mimeType))
      throw new BadRequestException('Unsupported evidence type');
    const limit = body.mimeType.startsWith('image/')
      ? this.config.get('EVIDENCE_IMAGE_MAX_BYTES', { infer: true })
      : this.config.get('EVIDENCE_VIDEO_MAX_BYTES', { infer: true });
    if (body.sizeBytes > limit) throw new PayloadTooLargeException('Evidence file is too large');
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .select({ id: incidents.id })
        .from(incidents)
        .innerJoin(orders, eq(orders.id, incidents.orderId))
        .where(and(eq(incidents.id, incidentId), eq(orders.customerId, customerId)))
        .for('update', { of: incidents });
      if (!row) throw new NotFoundException(INCIDENT_NOT_FOUND);
      await this.removeExpiredPendingEvidence(tx, incidentId);
      const countRows = await tx
        .select({ total: count() })
        .from(evidence)
        .where(eq(evidence.incidentId, incidentId));
      const total = countRows[0]?.total ?? 0;
      if (total >= this.config.get('EVIDENCE_MAX_FILES_PER_INCIDENT', { infer: true }))
        throw new ConflictException('Evidence file limit reached');
      const evidenceId = randomUUID();
      const storageKey = `evidence-pending/${incidentId}/${evidenceId}.${evidenceExtension(body.mimeType)}`;
      await tx.insert(evidence).values({
        id: evidenceId,
        incidentId,
        storageKey,
        mimeType: body.mimeType,
        sizeBytes: body.sizeBytes,
        status: 'pending',
      });
      const ttl = this.config.get('EVIDENCE_UPLOAD_URL_TTL_SECONDS', { infer: true });
      const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
      return {
        evidenceId,
        uploadUrl: await this.storage.createUploadUrl(
          storageKey,
          body.mimeType,
          body.sizeBytes,
          ttl,
        ),
        expiresAt,
      };
    });
  }

  private async removeExpiredPendingEvidence(
    tx: DatabaseTransaction,
    incidentId: string,
  ): Promise<void> {
    const ttl = this.config.get('EVIDENCE_PENDING_TTL_SECONDS', { infer: true });
    const expiresBefore = new Date(Date.now() - ttl * 1000);
    const expired = await tx
      .select({ id: evidence.id, storageKey: evidence.storageKey })
      .from(evidence)
      .where(
        and(
          eq(evidence.incidentId, incidentId),
          eq(evidence.status, 'pending'),
          lte(evidence.createdAt, expiresBefore),
        ),
      );

    for (const item of expired) {
      await this.storage.deleteObject(item.storageKey);
      await tx
        .delete(evidence)
        .where(and(eq(evidence.id, item.id), eq(evidence.status, 'pending')));
    }
  }

  async completeEvidenceUpload(
    actor: AuthActor,
    incidentId: string,
    evidenceId: string,
  ): Promise<void> {
    const customerId = requireCustomerId(actor);
    let copiedKey: string | undefined;
    let uploadKey: string | undefined;
    let transactionPrepared = false;
    try {
      await this.db.transaction(async (tx) => {
        const [locked] = await tx
          .select({ id: incidents.id })
          .from(incidents)
          .innerJoin(orders, eq(orders.id, incidents.orderId))
          .where(and(eq(incidents.id, incidentId), eq(orders.customerId, customerId)))
          .for('update', { of: incidents });
        if (!locked) throw new NotFoundException(INCIDENT_NOT_FOUND);
        const [row] = await tx
          .select({ incident: incidents, evidence })
          .from(evidence)
          .innerJoin(incidents, eq(incidents.id, evidence.incidentId))
          .innerJoin(orders, eq(orders.id, incidents.orderId))
          .where(
            and(
              eq(evidence.id, evidenceId),
              eq(evidence.incidentId, incidentId),
              eq(orders.customerId, customerId),
            ),
          );
        if (!row) throw new NotFoundException(INCIDENT_NOT_FOUND);
        if (row.evidence.status === 'ready') return;
        const source = await this.storage.headObject(row.evidence.storageKey);
        if (!source) throw new ConflictException('Evidence object was not uploaded');
        uploadKey = row.evidence.storageKey;
        copiedKey = `incidents/${incidentId}/ready/${randomUUID()}.${evidenceExtension(row.evidence.mimeType)}`;
        await this.storage.copyObject(uploadKey, copiedKey);
        const object = await this.storage.headObject(copiedKey);
        if (!object) throw new ConflictException('Evidence object was not uploaded');
        if (
          object.contentType !== row.evidence.mimeType ||
          object.sizeBytes !== row.evidence.sizeBytes
        )
          throw new BadRequestException('Evidence object does not match the upload request');
        const prefix = await this.storage.readPrefix(copiedKey, 32);
        if (!prefix || !contentMatchesMimeType(prefix, row.evidence.mimeType))
          throw new BadRequestException('Evidence content does not match its declared type');
        const updated = await tx
          .update(evidence)
          .set({ status: 'ready', storageKey: copiedKey })
          .where(and(eq(evidence.id, evidenceId), eq(evidence.status, 'pending')))
          .returning({ id: evidence.id });
        if (updated.length === 0) throw new ConflictException('Evidence is no longer pending');
        await tx.insert(incidentEvents).values({
          incidentId,
          kind: 'evidence_uploaded',
          fromStatus: row.incident.status,
          toStatus: row.incident.status,
          actor: actor.role,
          actorId: actor.id,
          reason: 'Evidence uploaded',
        });
        await publishIncidentEvent(tx, {
          type: 'incident.evidence_added',
          incidentId,
          status: row.incident.status,
          updatedAt: new Date().toISOString(),
        });
        transactionPrepared = true;
      });
    } catch (error) {
      // A failed COMMIT can have an unknown outcome. Never delete a potentially
      // committed ready object; reconcile this rare orphan separately.
      if (copiedKey && !transactionPrepared) {
        await this.storage.deleteObject(copiedKey).catch(() => {
          this.logger.warn('Could not delete an uncommitted evidence copy');
        });
      } else if (copiedKey) {
        this.logger.error(
          `Evidence completion outcome is unknown; reconcile storage key ${copiedKey}`,
        );
      }
      throw error;
    }
    if (uploadKey) {
      try {
        await this.storage.deleteObject(uploadKey);
      } catch {
        this.logger.warn(
          'Could not delete a completed temporary evidence object; lifecycle cleanup will retry',
        );
      }
    }
  }

  async listEvidence(actor: AuthActor, incidentId: string): Promise<EvidenceDownload[]> {
    const [incident] = await this.db
      .select({ id: incidents.id })
      .from(incidents)
      .innerJoin(orders, eq(orders.id, incidents.orderId))
      .where(and(eq(incidents.id, incidentId), ownedBy(actor)));
    if (!incident) throw new NotFoundException(INCIDENT_NOT_FOUND);
    const rows = await this.db
      .select()
      .from(evidence)
      .where(and(eq(evidence.incidentId, incidentId), eq(evidence.status, 'ready')))
      .orderBy(asc(evidence.createdAt));
    const ttl = this.config.get('EVIDENCE_DOWNLOAD_URL_TTL_SECONDS', { infer: true });
    return Promise.all(
      rows.map(async (item) => ({
        id: item.id,
        mimeType: item.mimeType,
        sizeBytes: item.sizeBytes,
        createdAt: item.createdAt.toISOString(),
        downloadUrl: await this.storage.createDownloadUrl(item.storageKey, ttl),
      })),
    );
  }

  async create(actor: AuthActor, body: CreateIncidentBody): Promise<Incident> {
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
        await tx
          .insert(incidents)
          .values({ orderId: order.id, type: body.type, description: body.description })
          .returning(),
      );

      await tx.insert(incidentEvents).values({
        incidentId: incident.id,
        kind: 'status_changed',
        fromStatus: null,
        toStatus: incident.status,
        actor: 'customer',
        actorId: customerId,
        occurredAt: incident.createdAt,
      });

      await publishIncidentChange(tx, 'incident.created', incident);

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
    const statusCounts = Object.fromEntries(
      INCIDENT_STATUSES.map((status) => [status, 0]),
    ) as Record<IncidentStatus, number>;
    for (const row of countRows) statusCounts[row.status] = row.total;
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
