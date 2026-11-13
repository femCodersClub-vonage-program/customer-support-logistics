import type {
  communications,
  customers,
  drivers,
  incidentEvents,
  incidents,
} from '../database/schema/index.js';
import type { IncidentDetail, IncidentListItem } from '@csl/contracts';
import type { Communication, Incident, IncidentEvent, Order } from '@csl/shared-types';

export type IncidentRow = typeof incidents.$inferSelect;

export type IncidentEventRow = typeof incidentEvents.$inferSelect;

export type CommunicationRow = typeof communications.$inferSelect;

export type CustomerRow = typeof customers.$inferSelect;

export type DriverRow = typeof drivers.$inferSelect;

export function toIncident(row: IncidentRow): Incident {
  return {
    id: row.id,
    orderId: row.orderId,
    type: row.type,
    status: row.status,
    agentId: row.agentId,
    resolution: row.resolution,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    closedAt: row.closedAt?.toISOString() ?? null,
  };
}

export function toIncidentListItem(
  row: IncidentRow,
  customer: Pick<CustomerRow, 'id' | 'name'>,
): IncidentListItem {
  return { ...toIncident(row), customer: { id: customer.id, name: customer.name } };
}

export function toIncidentEvent(row: IncidentEventRow): IncidentEvent {
  return {
    id: row.id,
    incidentId: row.incidentId,
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    actor: row.actor,
    actorId: row.actorId,
    reason: row.reason,
    occurredAt: row.occurredAt.toISOString(),
  };
}

export function toCommunication(row: CommunicationRow): Communication {
  return {
    id: row.id,
    incidentId: row.incidentId,
    channel: row.channel,
    direction: row.direction,
    fromNumber: row.fromNumber,
    toNumber: row.toNumber,
    vonageUuid: row.vonageUuid,
    status: row.status,
    durationSeconds: row.durationSeconds,
  };
}

export interface IncidentDetailRows {
  incident: IncidentRow;
  order: Order;
  customer: CustomerRow;
  driver: DriverRow | null;
  events: IncidentEventRow[];
  communications: CommunicationRow[];
}

export function toIncidentDetail(rows: IncidentDetailRows): IncidentDetail {
  return {
    ...toIncident(rows.incident),
    description: rows.incident.description,
    order: rows.order,
    customer: {
      id: rows.customer.id,
      name: rows.customer.name,
      phone: rows.customer.phone,
      locale: rows.customer.locale,
    },
    driver: rows.driver ? { id: rows.driver.id, name: rows.driver.name } : null,
    events: rows.events.map(toIncidentEvent),
    communications: rows.communications.map(toCommunication),
  };
}