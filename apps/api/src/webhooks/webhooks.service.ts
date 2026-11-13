import { DEFAULT_LOCALE, DRIVER_REPLIES } from '@csl/shared-types';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, desc, eq, inArray } from 'drizzle-orm';

import { maskPhone } from '../common/logging/mask-phone.js';
import { DATABASE } from '../database/database.constants.js';
import {
  communications,
  drivers,
  incidents,
  orders,
  routes,
  webhookEvents,
} from '../database/schema/index.js';
import { singleRow } from '../database/single-row.js';
import { invalidReplySms } from '../i18n/sms-templates.js';
import { persistTransition } from '../incidents/persist-transition.js';
import {
  buildDriverPromptNcco,
  buildInvalidKeyNcco,
  buildJoinConversationNcco,
} from '../vonage/ncco.js';
import { buildVoiceInputUrl } from '../vonage/voice-urls.js';
import { VONAGE_SERVICE } from '../vonage/vonage.service.js';

import { BackgroundTasks } from './background-tasks.js';
import { advancesStatus, fromMessageStatus, fromVoiceStatus } from './communication-status.js';
import { parseDriverReply } from './driver-reply.js';
import { toE164 } from './phone-number.js';
import { incidentIdFromCustomData } from './vonage-payloads.js';

import type {
  InboundSms,
  MessageStatus,
  VoiceAnswer,
  VoiceEvent,
  VoiceInput,
} from './vonage-payloads.js';
import type { Env } from '../config/env.schema.js';
import type { Database, DatabaseTransaction } from '../database/database.constants.js';
import type { WebhookEventSource } from '../database/schema/index.js';
import type { CommunicationRow, DriverRow, IncidentRow } from '../incidents/incidents.mapper.js';
import type { NccoAction } from '../vonage/ncco.js';
import type { VonageService } from '../vonage/vonage.service.js';
import type { IncidentStatus } from '@csl/shared-types';

type Executor = Database | DatabaseTransaction;

interface IncidentContext {
  incident: IncidentRow;
  driver: DriverRow | null;
}

interface DriverIncidentContext {
  incident: IncidentRow;
  driver: DriverRow;
}

interface InvalidReplyFollowUp {
  incidentId: string;
  driver: DriverRow;
  virtualNumber: string;
}

const ACTIVE_STATUSES: IncidentStatus[] = ['notified', 'in_mediation'];

const ACCEPTED_CALL_REASON = 'accepted_call';

function describeNumber(value: string | undefined): string {
  return value === undefined ? 'unknown number' : maskPhone(value);
}

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(VONAGE_SERVICE) private readonly vonage: VonageService,
    @Inject(BackgroundTasks) private readonly background: BackgroundTasks,
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>,
  ) {}

  async handleInboundSms(payload: InboundSms): Promise<void> {
    const followUp = await this.db.transaction(async (tx) => {
      const eventId = await this.recordEvent(tx, 'messages_inbound', payload.message_uuid, payload);

      if (eventId === null) {
        return null;
      }

      const fromNumber = toE164(payload.from);
      const context =
        fromNumber === null ? null : await this.findActiveIncidentForDriver(tx, fromNumber, true);

      const communication = singleRow(
        await tx
          .insert(communications)
          .values({
            incidentId: context?.incident.id ?? null,
            channel: 'sms',
            direction: 'inbound',
            fromNumber: fromNumber ?? payload.from,
            toNumber: toE164(payload.to) ?? payload.to,
            vonageUuid: payload.message_uuid,
            status: 'completed',
          })
          .returning(),
      );

      await this.linkEvent(tx, eventId, communication.id);

      if (context === null) {
        this.logger.warn(
          `Inbound SMS ${payload.message_uuid} from ${describeNumber(payload.from)} matches no active incident`,
        );
        return null;
      }

      if (context.incident.status !== 'notified') {
        return null;
      }

      const option = parseDriverReply(payload.text);

      if (option === null) {
        return {
          incidentId: context.incident.id,
          driver: context.driver,
          virtualNumber: communication.toNumber ?? payload.to,
        };
      }

      await persistTransition(tx, context.incident, {
        to: 'in_mediation',
        actor: 'driver',
        actorId: context.driver.id,
        reason: DRIVER_REPLIES[option],
      });

      return null;
    });

    if (followUp !== null) {
      this.background.run(`Invalid reply SMS for incident ${followUp.incidentId}`, () =>
        this.sendInvalidReply(followUp),
      );
    }
  }

  async handleMessageStatus(payload: MessageStatus): Promise<void> {
    await this.db.transaction(async (tx) => {
      const eventId = await this.recordEvent(
        tx,
        'messages_status',
        `${payload.message_uuid}:${payload.status}`,
        payload,
      );

      if (eventId === null) {
        return;
      }

      const [communication] = await tx
        .select()
        .from(communications)
        .where(eq(communications.vonageUuid, payload.message_uuid))
        .for('update');

      if (!communication) {
        this.logger.warn(`Status ${payload.status} for unknown message ${payload.message_uuid}`);
        return;
      }

      await this.linkEvent(tx, eventId, communication.id);

      const status = fromMessageStatus(payload.status);

      if (status === 'failed') {
        this.logger.warn(
          `SMS ${payload.message_uuid} for incident ${communication.incidentId ?? 'none'} was not delivered: ${payload.status}`,
        );
      }

      if (status !== null && advancesStatus(communication.status, status)) {
        await tx
          .update(communications)
          .set({ status })
          .where(eq(communications.id, communication.id));
      }
    });
  }

  async handleVoiceEvent(payload: VoiceEvent): Promise<void> {
    const { uuid, status } = payload;

    if (uuid === undefined || status === undefined) {
      return;
    }

    await this.db.transaction(async (tx) => {
      const eventId = await this.recordEvent(
        tx,
        'voice_event',
        `${uuid}:${status}:${payload.timestamp ?? ''}`,
        payload,
      );

      if (eventId === null) {
        return;
      }

      const mapped = fromVoiceStatus(status);
      const communication = await this.findOrCreateCall(tx, uuid, mapped ?? 'queued', payload);

      if (communication === null) {
        this.logger.warn(`Voice event ${status} for unknown call ${uuid} without direction`);
        return;
      }

      await this.linkEvent(tx, eventId, communication.id);

      const nextStatus =
        mapped !== null && advancesStatus(communication.status, mapped) ? mapped : undefined;
      const durationSeconds = payload.duration;

      if (nextStatus !== undefined || durationSeconds !== undefined) {
        await tx
          .update(communications)
          .set({ status: nextStatus, durationSeconds })
          .where(eq(communications.id, communication.id));
      }
    });
  }

  async answerCall(payload: VoiceAnswer): Promise<NccoAction[]> {
    if (payload.endpoint_type === 'app') {
      return this.answerAppCall(payload);
    }

    const fromNumber = toE164(payload.from);
    const callingIn =
      fromNumber === null ? null : await this.findActiveIncidentForDriver(this.db, fromNumber);

    if (callingIn !== null) {
      if (callingIn.incident.status === 'in_mediation') {
        return buildJoinConversationNcco(callingIn.incident.id);
      }

      this.logger.log(
        `Driver call ${payload.uuid ?? ''} for incident ${callingIn.incident.id} without an open mediation`,
      );
      return [];
    }

    const toNumber = toE164(payload.to);
    const called =
      toNumber === null ? null : await this.findActiveIncidentForDriver(this.db, toNumber);

    if (called === null) {
      this.logger.warn(
        `Call ${payload.uuid ?? ''} from ${describeNumber(payload.from)} to ${describeNumber(payload.to)} matches no active incident`,
      );
      return [];
    }

    const inputUrl = this.voiceInputUrl(called.incident.id);

    if (inputUrl === null) {
      this.logger.error(
        `Cannot prompt the driver of incident ${called.incident.id}: PUBLIC_URL is not set`,
      );
      return [];
    }

    return buildDriverPromptNcco({
      locale: called.driver.locale,
      orderId: called.incident.orderId,
      inputUrl,
    });
  }

  async handleVoiceInput(
    incidentId: string | undefined,
    payload: VoiceInput,
  ): Promise<NccoAction[]> {
    return this.db.transaction(async (tx) => {
      const callId = payload.uuid ?? payload.conversation_uuid ?? '';
      const eventId = await this.recordEvent(
        tx,
        'voice_input',
        `${callId}:${payload.timestamp}`,
        payload,
      );

      if (eventId !== null && payload.uuid !== undefined) {
        const [call] = await tx
          .select({ id: communications.id })
          .from(communications)
          .where(eq(communications.vonageUuid, payload.uuid));

        if (call) {
          await this.linkEvent(tx, eventId, call.id);
        }
      }

      const context = incidentId === undefined ? null : await this.findIncident(tx, incidentId);

      if (context === null) {
        this.logger.warn(
          `DTMF input on call ${callId} for unknown incident ${incidentId ?? 'none'}`,
        );
        return [];
      }

      const pressedOne = payload.dtmf?.digits === '1' && payload.dtmf.timed_out !== true;

      if (!pressedOne) {
        return buildInvalidKeyNcco(context.driver?.locale ?? DEFAULT_LOCALE);
      }

      if (context.incident.status === 'notified') {
        await persistTransition(tx, context.incident, {
          to: 'in_mediation',
          actor: 'driver',
          actorId: context.driver?.id,
          reason: ACCEPTED_CALL_REASON,
        });

        return buildJoinConversationNcco(context.incident.id);
      }

      if (context.incident.status === 'in_mediation') {
        return buildJoinConversationNcco(context.incident.id);
      }

      this.logger.log(
        `Driver pressed 1 for incident ${context.incident.id} in ${context.incident.status}`,
      );
      return [];
    });
  }

  private async answerAppCall(payload: VoiceAnswer): Promise<NccoAction[]> {
    const incidentId = incidentIdFromCustomData(payload.custom_data);

    if (incidentId === null) {
      this.logger.warn(`App call ${payload.uuid ?? ''} without an incident id`);
      return [];
    }

    const [incident] = await this.db
      .select({ status: incidents.status })
      .from(incidents)
      .where(eq(incidents.id, incidentId));

    if (incident?.status !== 'in_mediation') {
      this.logger.warn(
        `App call ${payload.uuid ?? ''} for incident ${incidentId} not in mediation`,
      );
      return [];
    }

    return buildJoinConversationNcco(incidentId);
  }

  private async sendInvalidReply({
    incidentId,
    driver,
    virtualNumber,
  }: InvalidReplyFollowUp): Promise<void> {
    const { messageId } = await this.vonage.sendSms(driver.phone, invalidReplySms(driver.locale));

    await this.db.insert(communications).values({
      incidentId,
      channel: 'sms',
      direction: 'outbound',
      fromNumber: virtualNumber,
      toNumber: driver.phone,
      vonageUuid: messageId,
      status: 'queued',
    });
  }

  private async recordEvent(
    tx: DatabaseTransaction,
    source: WebhookEventSource,
    eventKey: string,
    payload: unknown,
  ): Promise<string | null> {
    const [event] = await tx
      .insert(webhookEvents)
      .values({ source, eventKey, payload })
      .onConflictDoNothing({ target: [webhookEvents.source, webhookEvents.eventKey] })
      .returning({ id: webhookEvents.id });

    if (!event) {
      this.logger.log(`Ignored duplicate ${source} event ${eventKey}`);
      return null;
    }

    return event.id;
  }

  private async linkEvent(
    tx: DatabaseTransaction,
    eventId: string,
    communicationId: string,
  ): Promise<void> {
    await tx.update(webhookEvents).set({ communicationId }).where(eq(webhookEvents.id, eventId));
  }

  private async findOrCreateCall(
    tx: DatabaseTransaction,
    uuid: string,
    status: CommunicationRow['status'],
    payload: VoiceEvent,
  ): Promise<CommunicationRow | null> {
    const existing = await this.lockCall(tx, uuid);

    if (existing !== null || payload.direction === undefined) {
      return existing;
    }

    const driverNumber = toE164(payload.direction === 'inbound' ? payload.from : payload.to);
    const context =
      driverNumber === null ? null : await this.findActiveIncidentForDriver(tx, driverNumber);

    const [created] = await tx
      .insert(communications)
      .values({
        incidentId: context?.incident.id ?? null,
        channel: 'voice',
        direction: payload.direction,
        fromNumber: toE164(payload.from) ?? payload.from ?? null,
        toNumber: toE164(payload.to) ?? payload.to ?? null,
        vonageUuid: uuid,
        status,
      })
      .onConflictDoNothing({ target: communications.vonageUuid })
      .returning();

    return created ?? (await this.lockCall(tx, uuid));
  }

  private async lockCall(tx: DatabaseTransaction, uuid: string): Promise<CommunicationRow | null> {
    const [call] = await tx
      .select()
      .from(communications)
      .where(eq(communications.vonageUuid, uuid))
      .for('update');

    return call ?? null;
  }

  private async findActiveIncidentForDriver(
    executor: Executor,
    phone: string,
    lock = false,
  ): Promise<DriverIncidentContext | null> {
    const query = executor
      .select({ incident: incidents, driver: drivers })
      .from(incidents)
      .innerJoin(orders, eq(orders.id, incidents.orderId))
      .innerJoin(routes, eq(routes.id, orders.routeId))
      .innerJoin(drivers, eq(drivers.id, routes.driverId))
      .where(and(eq(drivers.phone, phone), inArray(incidents.status, ACTIVE_STATUSES)))
      .orderBy(desc(incidents.createdAt), desc(incidents.id))
      .limit(1);

    const [row] = lock ? await query.for('update', { of: incidents }) : await query;

    return row ?? null;
  }

  private async findIncident(
    tx: DatabaseTransaction,
    incidentId: string,
  ): Promise<IncidentContext | null> {
    const [row] = await tx
      .select({ incident: incidents, driver: drivers })
      .from(incidents)
      .innerJoin(orders, eq(orders.id, incidents.orderId))
      .leftJoin(routes, eq(routes.id, orders.routeId))
      .leftJoin(drivers, eq(drivers.id, routes.driverId))
      .where(eq(incidents.id, incidentId))
      .for('update', { of: incidents });

    return row ?? null;
  }

  private voiceInputUrl(incidentId: string): string | null {
    const publicUrl = this.config.get('PUBLIC_URL', { infer: true });

    return publicUrl === undefined ? null : buildVoiceInputUrl(publicUrl, incidentId);
  }
}
