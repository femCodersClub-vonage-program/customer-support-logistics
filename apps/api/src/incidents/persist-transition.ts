import { eq } from 'drizzle-orm';

import { incidentEvents, incidents } from '../database/schema/index.js';
import { singleRow } from '../database/single-row.js';

import { transition } from './domain/incident-state-machine.js';
import { toIncident } from './incidents.mapper.js';

import type { TransitionCommand } from './domain/incident-state-machine.js';
import type { IncidentRow } from './incidents.mapper.js';
import type { DatabaseTransaction } from '../database/database.constants.js';

export async function persistTransition(
  tx: DatabaseTransaction,
  current: IncidentRow,
  command: TransitionCommand,
): Promise<IncidentRow> {
  const { incident, event } = transition(toIncident(current), command);

  const updated = singleRow(
    await tx
      .update(incidents)
      .set({
        status: incident.status,
        resolution: incident.resolution,
        closedAt: incident.closedAt === null ? null : new Date(incident.closedAt),
      })
      .where(eq(incidents.id, current.id))
      .returning(),
  );

  await tx.insert(incidentEvents).values({
    id: event.id,
    incidentId: event.incidentId,
    fromStatus: event.fromStatus,
    toStatus: event.toStatus,
    actor: event.actor,
    actorId: event.actorId,
    reason: event.reason,
    occurredAt: new Date(event.occurredAt),
  });

  return updated;
}
