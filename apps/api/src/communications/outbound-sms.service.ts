import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, isNull } from 'drizzle-orm';

import { DATABASE } from '../database/database.constants.js';
import { communications } from '../database/schema/index.js';
import { publishCommunicationChange } from '../events/publish-incident-event.js';
import { attachSmsUuidAndApplyEarlyStatuses } from '../incidents/outbound-sms.js';
import { JOB_QUEUE } from '../jobs/job-queue.js';
import { VonageError } from '../vonage/vonage.errors.js';
import { VONAGE_SERVICE } from '../vonage/vonage.service.js';

import type { Env } from '../config/env.schema.js';
import type { Database, DatabaseTransaction } from '../database/database.constants.js';
import type { CommunicationRow } from '../incidents/incidents.mapper.js';
import type { JobPayloads, JobQueue } from '../jobs/job-queue.js';
import type { VonageService } from '../vonage/vonage.service.js';
import type { OnModuleInit } from '@nestjs/common';

export interface OutboundSmsRequest {
  incidentId: string;
  idempotencyKey: string;
  to: string;
  text: string;
}

@Injectable()
export class OutboundSmsService implements OnModuleInit {
  private readonly logger = new Logger(OutboundSmsService.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(VONAGE_SERVICE) private readonly vonage: VonageService,
    @Inject(JOB_QUEUE) private readonly queue: JobQueue,
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>,
  ) {}

  onModuleInit(): void {
    this.queue.work('outbound-sms', (data) => this.deliver(data));
  }

  async enqueue(
    tx: DatabaseTransaction,
    { incidentId, idempotencyKey, to, text }: OutboundSmsRequest,
  ): Promise<CommunicationRow | null> {
    const [created] = await tx
      .insert(communications)
      .values({
        incidentId,
        idempotencyKey,
        channel: 'sms',
        direction: 'outbound',
        fromNumber: this.config.get('VONAGE_VIRTUAL_NUMBER', { infer: true }) ?? null,
        toNumber: to,
        vonageUuid: null,
        status: 'pending',
      })
      .onConflictDoNothing({ target: communications.idempotencyKey })
      .returning();

    if (!created) {
      return null;
    }

    await publishCommunicationChange(tx, 'incident.communication_added', created);
    await this.queue.send(tx, 'outbound-sms', { communicationId: created.id, to, text });

    return created;
  }

  private async deliver({ communicationId, to, text }: JobPayloads['outbound-sms']): Promise<void> {
    const [reservation] = await this.db
      .select({ status: communications.status, vonageUuid: communications.vonageUuid })
      .from(communications)
      .where(eq(communications.id, communicationId));

    if (reservation?.status !== 'pending' || reservation.vonageUuid !== null) {
      return;
    }

    let messageId: string;

    try {
      ({ messageId } = await this.vonage.sendSms(to, text));
    } catch (error) {
      if (!(error instanceof VonageError)) {
        throw error;
      }

      this.logger.warn(`SMS ${communicationId} was not sent: ${error.message}`);
      await this.markFailed(communicationId);
      return;
    }

    await this.db.transaction((tx) =>
      attachSmsUuidAndApplyEarlyStatuses(tx, communicationId, messageId),
    );
  }

  private async markFailed(communicationId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(communications)
        .set({ status: 'failed' })
        .where(
          and(
            eq(communications.id, communicationId),
            eq(communications.status, 'pending'),
            isNull(communications.vonageUuid),
          ),
        )
        .returning();

      if (updated) {
        await publishCommunicationChange(tx, 'incident.communication_updated', updated);
      }
    });
  }
}
