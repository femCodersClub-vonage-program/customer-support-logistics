import { sql } from 'drizzle-orm';

import type { Database, DatabaseTransaction } from '../database/database.constants.js';
import type { CommunicationRow, IncidentRow } from '../incidents/incidents.mapper.js';
import type { IncidentStreamEvent, IncidentStreamEventType } from '@csl/shared-types';

export const INCIDENT_EVENTS_CHANNEL = 'csl_incident_events';

type Executor = Database | DatabaseTransaction;

type IncidentChange = Extract<
  IncidentStreamEventType,
  'incident.created' | 'incident.status_changed' | 'incident.assigned'
>;

type CommunicationChange = Extract<
  IncidentStreamEventType,
  'incident.communication_added' | 'incident.communication_updated'
>;

export async function publishIncidentEvent(
  executor: Executor,
  event: IncidentStreamEvent,
): Promise<void> {
  await executor.execute(
    sql`SELECT pg_notify(${INCIDENT_EVENTS_CHANNEL}, ${JSON.stringify(event)})`,
  );
}

export function publishIncidentChange(
  executor: Executor,
  type: IncidentChange,
  incident: Pick<IncidentRow, 'id' | 'status' | 'updatedAt'>,
): Promise<void> {
  return publishIncidentEvent(executor, {
    type,
    incidentId: incident.id,
    status: incident.status,
    updatedAt: incident.updatedAt.toISOString(),
  });
}

export async function publishCommunicationChange(
  executor: Executor,
  type: CommunicationChange,
  communication: Pick<CommunicationRow, 'incidentId' | 'updatedAt'>,
): Promise<void> {
  if (communication.incidentId === null) {
    return;
  }

  await publishIncidentEvent(executor, {
    type,
    incidentId: communication.incidentId,
    updatedAt: communication.updatedAt.toISOString(),
  });
}
