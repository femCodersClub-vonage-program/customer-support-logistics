import { and, asc, eq, isNull, sql } from 'drizzle-orm';

import { communications, webhookEvents } from '../database/schema/index.js';
import { singleRow } from '../database/single-row.js';
import { publishCommunicationChange } from '../events/publish-incident-event.js';
import { advancesStatus, fromMessageStatus } from '../webhooks/communication-status.js';
import { messageStatusSchema } from '../webhooks/vonage-payloads.js';

import type { DatabaseTransaction } from '../database/database.constants.js';
import type { CommunicationStatus } from '@csl/shared-types';

export async function attachSmsUuid(
  tx: DatabaseTransaction,
  communicationId: string,
  messageId: string,
): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${messageId}))`);

  let communication = singleRow(
    await tx
      .update(communications)
      .set({ vonageUuid: messageId, status: 'queued' })
      .where(eq(communications.id, communicationId))
      .returning(),
  );

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

    await tx.update(webhookEvents).set({ communicationId }).where(eq(webhookEvents.id, event.id));

    const nextStatus = fromMessageStatus(parsed.data.status);
    if (nextStatus !== null && advancesStatus(currentStatus, nextStatus)) {
      currentStatus = nextStatus;
    }
  }

  if (currentStatus !== 'queued') {
    communication = singleRow(
      await tx
        .update(communications)
        .set({ status: currentStatus })
        .where(eq(communications.id, communicationId))
        .returning(),
    );
  }

  await publishCommunicationChange(tx, 'incident.communication_updated', communication);
}
