import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, gt, inArray, isNotNull, isNull, notLike, or, sql } from 'drizzle-orm';

import { OutboundSmsService } from '../communications/outbound-sms.service.js';
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
import {
  publishCommunicationChange,
  publishIncidentChange,
} from '../events/publish-incident-event.js';
import { callFallbackSms, callSoonSms, mediationInviteSms } from '../i18n/sms-templates.js';
import { JOB_QUEUE } from '../jobs/job-queue.js';
import { buildDriverPromptNcco } from '../vonage/ncco.js';
import { buildCallUrl, buildVoiceInputUrl } from '../vonage/voice-urls.js';
import { vonageUserName } from '../vonage/vonage-users.js';
import { VonageError, VonageRequestError } from '../vonage/vonage.errors.js';
import { VONAGE_SERVICE } from '../vonage/vonage.service.js';
import { advancesStatus } from '../webhooks/communication-status.js';

import { toCommunication, toIncident } from './incidents.mapper.js';
import { MEDIATION_CALL_ATTEMPTS, mediationKeys, parseMediationCallKey } from './mediation-keys.js';
import { persistIncidentActivity, persistTransition } from './persist-transition.js';

import type { CommunicationRow, CustomerRow, DriverRow, IncidentRow } from './incidents.mapper.js';
import type { Env } from '../config/env.schema.js';
import type { Database, DatabaseTransaction } from '../database/database.constants.js';
import type { JobPayloads, JobQueue } from '../jobs/job-queue.js';
import type { NccoAction } from '../vonage/ncco.js';
import type { VonageService } from '../vonage/vonage.service.js';
import type { MediationParticipant, StartMediationResponse } from '@csl/contracts';
import type { Communication, IncidentEventKind } from '@csl/shared-types';
import type { OnModuleInit } from '@nestjs/common';

export const STALE_QUEUED_CALL_MS = 2 * 60 * 1000;

export const DRIVER_UNREACHABLE_REASON = 'no_answer_after_retries';

interface LockedIncident {
  incident: IncidentRow;
  driver: DriverRow | null;
  customer: CustomerRow;
}

interface PreparedCall {
  driver: DriverRow;
  ncco: NccoAction[];
}

interface ReservedCall extends PreparedCall {
  communicationId: string;
}

export interface BlockedParticipants {
  ended: boolean;
  customer: boolean;
  driver: boolean;
}

type StopTarget = 'end' | MediationParticipant;

type CallAttempt = { ok: true; call: CommunicationRow } | { ok: false; error: VonageError };

// The customer's leg comes from the browser and is named after their Vonage user. The driver's is
// the call we placed to their phone, or the one they placed to the virtual number.
function isLegOf(
  leg: CommunicationRow,
  participant: MediationParticipant,
  { customer, driver }: LockedIncident,
): boolean {
  if (participant === 'customer') {
    return leg.fromNumber === vonageUserName({ role: 'customer', id: customer.id });
  }

  return driver !== null && (leg.toNumber === driver.phone || leg.fromNumber === driver.phone);
}

function unwrap(attempt: CallAttempt): CommunicationRow {
  if (!attempt.ok) {
    throw attempt.error;
  }

  return attempt.call;
}

@Injectable()
export class MediationService implements OnModuleInit {
  private readonly logger = new Logger(MediationService.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(VONAGE_SERVICE) private readonly vonage: VonageService,
    @Inject(JOB_QUEUE) private readonly queue: JobQueue,
    @Inject(OutboundSmsService) private readonly sms: OutboundSmsService,
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>,
  ) {}

  onModuleInit(): void {
    this.queue.work('mediation-call', (data) => this.placeScheduledCall(data));
  }

  async start(agentId: string, id: string): Promise<StartMediationResponse> {
    const incident = await this.db.transaction(async (tx) => {
      const locked = await this.lockIncident(tx, id);
      let current = locked.incident;

      if (current.status !== 'in_mediation') {
        current = await persistTransition(tx, current, {
          to: 'in_mediation',
          actor: 'agent',
          actorId: agentId,
        });
      } else if ((await this.blocked(tx, id)).ended) {
        current = await persistIncidentActivity(tx, current, {
          kind: 'mediation_reopened',
          actor: 'agent',
          actorId: agentId,
        });
      }

      if (current.agentId === null) {
        current = singleRow(
          await tx
            .update(incidents)
            .set({ agentId })
            .where(eq(incidents.id, current.id))
            .returning(),
        );

        await publishIncidentChange(tx, 'incident.assigned', current);
      }

      if (locked.driver === null) {
        throw new ConflictException('Incident has no driver assigned');
      }

      await this.scheduleMediation(tx, current, locked.driver, locked.customer);

      return current;
    });

    return { incident: toIncident(incident), call: null };
  }

  async callDriver(id: string): Promise<Communication> {
    const attempt = await this.db.transaction(async (tx) => {
      const locked = await this.lockIncident(tx, id);

      if (locked.incident.status !== 'in_mediation') {
        throw new ConflictException('Incident is not in mediation');
      }

      const blocked = await this.blocked(tx, id);

      if (blocked.ended) {
        throw new ConflictException('The mediation call has ended');
      }

      if (blocked.driver) {
        throw new ConflictException('The driver was removed from the call');
      }

      return this.placeCall(tx, locked.incident.id, await this.prepareCall(tx, locked));
    });

    return toCommunication(unwrap(attempt));
  }

  // Ends the mediation call for everyone. The end is stored as an incident event so that nobody can
  // join again through the webhooks and no driver call is placed until the mediation is started
  // again, and the driver calls
  // that are still being placed are cancelled. The legs themselves are marked as completed by the
  // voice event webhook when Vonage reports it. If the hang-up fails the marker stays, so the agent
  // can try again.
  async end(agentId: string, id: string): Promise<void> {
    await this.stop(agentId, id, 'end');
  }

  // Removes the customer or the driver from the call. It is permanent for the incident: the removed
  // participant cannot join again through the webhooks, and the driver is not called again.
  async removeParticipant(
    agentId: string,
    id: string,
    participant: MediationParticipant,
  ): Promise<void> {
    await this.stop(agentId, id, participant);
  }

  // Which participants can no longer join the conversation, because of a removal or the end.
  async blocked(tx: DatabaseTransaction, incidentId: string): Promise<BlockedParticipants> {
    const stops = await tx
      .select({ kind: incidentEvents.kind, reason: incidentEvents.reason })
      .from(incidentEvents)
      .where(
        and(
          eq(incidentEvents.incidentId, incidentId),
          inArray(incidentEvents.kind, [
            'participant_removed',
            'mediation_call_ended',
            'mediation_reopened',
          ]),
        ),
      );

    const count = (kind: IncidentEventKind) => stops.filter((stop) => stop.kind === kind).length;
    const ended = count('mediation_call_ended') > count('mediation_reopened');
    const removed = (who: MediationParticipant) =>
      stops.some(({ kind, reason }) => kind === 'participant_removed' && reason === who);

    return { ended, customer: ended || removed('customer'), driver: ended || removed('driver') };
  }

  async attemptFailed(tx: DatabaseTransaction, call: CommunicationRow): Promise<void> {
    const parsed = parseMediationCallKey(call.idempotencyKey);

    if (parsed === null) {
      return;
    }

    if (parsed.attempt < MEDIATION_CALL_ATTEMPTS) {
      await this.queue.send(
        tx,
        'mediation-call',
        { incidentId: parsed.incidentId, attempt: parsed.attempt + 1 },
        { delaySeconds: this.config.get('MEDIATION_RETRY_DELAY_SECONDS', { infer: true }) },
      );
      return;
    }

    await this.giveUp(tx, parsed.incidentId);
  }

  async recordDriverJoined(
    tx: DatabaseTransaction,
    incident: IncidentRow,
    driverId: string | undefined,
  ): Promise<void> {
    if (await this.driverJoined(tx, incident.id)) {
      return;
    }

    await persistIncidentActivity(tx, incident, {
      kind: 'driver_joined',
      actor: 'driver',
      actorId: driverId,
    });
  }

  private async scheduleMediation(
    tx: DatabaseTransaction,
    incident: IncidentRow,
    driver: DriverRow,
    customer: CustomerRow,
  ): Promise<void> {
    if (
      !(await this.driverJoined(tx, incident.id)) &&
      !(await this.blocked(tx, incident.id)).driver
    ) {
      await this.scheduleDriverCall(tx, incident, driver);
    }

    const clientPublicUrl = this.config.get('CLIENT_PUBLIC_URL', { infer: true });

    if (clientPublicUrl === undefined) {
      this.logger.error(
        `Cannot invite the customer of incident ${incident.id}: CLIENT_PUBLIC_URL is not set`,
      );
      return;
    }

    await this.sms.enqueue(tx, {
      incidentId: incident.id,
      idempotencyKey: mediationKeys.invite(incident.id),
      to: customer.phone,
      text: mediationInviteSms(customer.locale, {
        orderId: incident.orderId,
        url: buildCallUrl(clientPublicUrl, incident.id),
      }),
    });
  }

  private async scheduleDriverCall(
    tx: DatabaseTransaction,
    incident: IncidentRow,
    driver: DriverRow,
  ): Promise<void> {
    const delaySeconds = this.config.get('MEDIATION_CALL_DELAY_SECONDS', { infer: true });

    const callSoon = await this.sms.enqueue(tx, {
      incidentId: incident.id,
      idempotencyKey: mediationKeys.callSoon(incident.id),
      to: driver.phone,
      text: callSoonSms(driver.locale, {
        orderId: incident.orderId,
        minutes: Math.max(1, Math.round(delaySeconds / 60)),
      }),
    });

    if (callSoon === null) {
      return;
    }

    await this.queue.send(
      tx,
      'mediation-call',
      { incidentId: incident.id, attempt: 1 },
      { delaySeconds },
    );
  }

  private async placeScheduledCall({
    incidentId,
    attempt,
  }: JobPayloads['mediation-call']): Promise<void> {
    const reserved = await this.db.transaction((tx) => this.reserveCall(tx, incidentId, attempt));

    if (reserved === null) {
      return;
    }

    let callId: string;

    try {
      ({ callId } = await this.vonage.createCall(reserved.driver.phone, reserved.ncco));
    } catch (error) {
      if (!(error instanceof VonageError)) {
        throw error;
      }

      this.logger.warn(
        `Call ${attempt} to the driver of incident ${incidentId} was not created: ${error.message}`,
      );
      await this.db.transaction(async (tx) => {
        const failed = singleRow(
          await tx
            .update(communications)
            .set({ status: 'failed' })
            .where(eq(communications.id, reserved.communicationId))
            .returning(),
        );

        await publishCommunicationChange(tx, 'incident.communication_updated', failed);
        await this.attemptFailed(tx, failed);
      });
      return;
    }

    const cancelled = await this.db.transaction((tx) =>
      this.attachCallUuid(tx, reserved.communicationId, callId),
    );

    if (cancelled) {
      // The call ended while this one was being created, so the driver must not be left ringing.
      await this.hangUp(incidentId, [callId]).catch((error: unknown) => {
        this.logger.error(
          `Call ${callId} to the driver of incident ${incidentId} was cancelled but could not be hung up: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    }
  }

  private async reserveCall(
    tx: DatabaseTransaction,
    incidentId: string,
    attempt: number,
  ): Promise<ReservedCall | null> {
    const locked = await this.findLockedIncident(tx, incidentId);

    if (locked === null || locked.incident.status !== 'in_mediation' || locked.driver === null) {
      this.logger.log(`Skipped call ${attempt} for incident ${incidentId}: no longer in mediation`);
      return null;
    }

    if (await this.driverJoined(tx, incidentId)) {
      this.logger.log(`Skipped call ${attempt} for incident ${incidentId}: the driver joined`);
      return null;
    }

    if ((await this.blocked(tx, incidentId)).driver) {
      this.logger.log(
        `Skipped call ${attempt} for incident ${incidentId}: the call ended or the driver was removed`,
      );
      return null;
    }

    if (await this.hasActiveCall(tx, incidentId, locked.driver.phone, { manualOnly: true })) {
      this.logger.log(
        `Skipped call ${attempt} for incident ${incidentId}: another call to the driver is active`,
      );
      return null;
    }

    const prepared = this.buildCall(locked.incident, locked.driver);

    const [reservation] = await tx
      .insert(communications)
      .values({
        incidentId,
        idempotencyKey: mediationKeys.call(incidentId, attempt),
        channel: 'voice',
        direction: 'outbound',
        fromNumber: this.config.get('VONAGE_VIRTUAL_NUMBER', { infer: true }) ?? null,
        toNumber: prepared.driver.phone,
        vonageUuid: null,
        status: 'pending',
      })
      .onConflictDoNothing({ target: communications.idempotencyKey })
      .returning();

    if (!reservation) {
      this.logger.log(`Skipped call ${attempt} for incident ${incidentId}: already placed`);
      return null;
    }

    await publishCommunicationChange(tx, 'incident.communication_added', reservation);

    return { ...prepared, communicationId: reservation.id };
  }

  private async attachCallUuid(
    tx: DatabaseTransaction,
    communicationId: string,
    callId: string,
  ): Promise<boolean> {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${callId}))`);

    const [current] = await tx
      .select()
      .from(communications)
      .where(eq(communications.id, communicationId))
      .for('update');

    if (!current || current.vonageUuid === callId) {
      return false;
    }

    const updated = singleRow(
      await tx
        .update(communications)
        .set({
          vonageUuid: callId,
          status: advancesStatus(current.status, 'queued') ? 'queued' : current.status,
        })
        .where(eq(communications.id, communicationId))
        .returning(),
    );

    await publishCommunicationChange(tx, 'incident.communication_updated', updated);

    // A reservation that is already failed was cancelled by the end of the call or the removal.
    return current.status === 'failed';
  }

  private async giveUp(tx: DatabaseTransaction, incidentId: string): Promise<void> {
    const locked = await this.findLockedIncident(tx, incidentId);

    if (locked === null || locked.incident.status !== 'in_mediation' || locked.driver === null) {
      return;
    }

    if (await this.driverJoined(tx, incidentId)) {
      return;
    }

    const fallback = await this.sms.enqueue(tx, {
      incidentId,
      idempotencyKey: mediationKeys.callFallback(incidentId),
      to: locked.driver.phone,
      text: callFallbackSms(locked.driver.locale, { orderId: locked.incident.orderId }),
    });

    if (fallback === null) {
      return;
    }

    await persistIncidentActivity(tx, locked.incident, {
      kind: 'driver_unreachable',
      actor: 'system',
      reason: DRIVER_UNREACHABLE_REASON,
    });
  }

  // Stores the end or the removal, cancels the driver calls that are still being placed and hangs
  // up the legs that are on the call. Everything is decided under the lock of the incident, so a
  // call to the driver that is being created either finishes first (and is hung up here) or finds
  // the marker.
  private async stop(agentId: string, id: string, target: StopTarget): Promise<void> {
    const callIds = await this.db.transaction(async (tx) => {
      const locked = await this.lockIncident(tx, id);

      if (locked.incident.status !== 'in_mediation') {
        throw new ConflictException('Incident is not in mediation');
      }

      if (target === 'driver' && locked.driver === null) {
        throw new ConflictException('Incident has no driver assigned');
      }

      const blocked = await this.blocked(tx, id);
      const alreadyStopped = target === 'end' ? blocked.ended : blocked[target];
      const participant = target === 'end' ? undefined : target;

      const legs = await this.activeLegs(tx, id, participant, locked);
      const pending = target === 'customer' ? [] : await this.pendingReservations(tx, id);
      const driverCallComing =
        target !== 'customer' && !alreadyStopped && (await this.driverCallComing(tx, id));

      if (legs.length === 0 && pending.length === 0 && !driverCallComing) {
        throw new ConflictException(
          target === 'end' ? 'There is no call to end' : `The ${target} is not on the call`,
        );
      }

      if (!alreadyStopped) {
        await persistIncidentActivity(tx, locked.incident, {
          kind: target === 'end' ? 'mediation_call_ended' : 'participant_removed',
          actor: 'agent',
          actorId: agentId,
          ...(participant === undefined ? {} : { reason: participant }),
        });
      }

      for (const reservation of pending) {
        const cancelled = singleRow(
          await tx
            .update(communications)
            .set({ status: 'failed' })
            .where(eq(communications.id, reservation.id))
            .returning(),
        );

        await publishCommunicationChange(tx, 'incident.communication_updated', cancelled);
      }

      return legs.flatMap(({ vonageUuid }) => (vonageUuid === null ? [] : [vonageUuid]));
    });

    if (callIds.length > 0) {
      await this.hangUp(id, callIds);
    }
  }

  // The voice legs of the incident that Vonage still reports as ringing or connected. Everyone in
  // the conversation is one of them, since the answer URL and the call to the driver store their legs.
  private async activeLegs(
    tx: DatabaseTransaction,
    id: string,
    participant: MediationParticipant | undefined,
    locked: LockedIncident,
  ): Promise<CommunicationRow[]> {
    const legs = await tx
      .select()
      .from(communications)
      .where(
        and(
          eq(communications.incidentId, id),
          eq(communications.channel, 'voice'),
          inArray(communications.status, ['queued', 'in_progress']),
          isNotNull(communications.vonageUuid),
        ),
      );

    return legs.filter((leg) => participant === undefined || isLegOf(leg, participant, locked));
  }

  // Driver calls that were reserved but whose Vonage call has not been created yet.
  private async pendingReservations(
    tx: DatabaseTransaction,
    incidentId: string,
  ): Promise<CommunicationRow[]> {
    return tx
      .select()
      .from(communications)
      .where(
        and(
          eq(communications.incidentId, incidentId),
          eq(communications.channel, 'voice'),
          eq(communications.status, 'pending'),
          isNull(communications.vonageUuid),
        ),
      );
  }

  // The driver has not joined and the calls to them have not given up, so the retry job may still
  // place one.
  private async driverCallComing(tx: DatabaseTransaction, incidentId: string): Promise<boolean> {
    const [settled] = await tx
      .select({ id: incidentEvents.id })
      .from(incidentEvents)
      .where(
        and(
          eq(incidentEvents.incidentId, incidentId),
          inArray(incidentEvents.kind, ['driver_joined', 'driver_unreachable']),
        ),
      )
      .limit(1);

    return settled === undefined;
  }

  // Tries every leg even if one fails, so a single bad leg doesn't leave the others on the call.
  private async hangUp(incidentId: string, callIds: string[]): Promise<void> {
    const outcomes = await Promise.all(
      callIds.map(async (callId) => {
        try {
          await this.vonage.hangupCall(callId);
          return null;
        } catch (error) {
          this.logger.warn(
            `Hang-up of call ${callId} for incident ${incidentId} failed: ${error instanceof Error ? error.message : String(error)}`,
          );
          return { error };
        }
      }),
    );

    const [failure] = outcomes.flatMap((outcome) => (outcome === null ? [] : [outcome.error]));

    if (failure !== undefined) {
      // Any failure of the hang-up is a Vonage failure for the agent, so it always answers 502.
      throw failure instanceof VonageError ? failure : new VonageRequestError('hangupCall');
    }
  }

  private async driverJoined(tx: DatabaseTransaction, incidentId: string): Promise<boolean> {
    const [joined] = await tx
      .select({ id: incidentEvents.id })
      .from(incidentEvents)
      .where(
        and(eq(incidentEvents.incidentId, incidentId), eq(incidentEvents.kind, 'driver_joined')),
      )
      .limit(1);

    return joined !== undefined;
  }

  private async lockIncident(tx: DatabaseTransaction, id: string): Promise<LockedIncident> {
    const locked = await this.findLockedIncident(tx, id);

    if (locked === null) {
      throw new NotFoundException('Incident not found');
    }

    return locked;
  }

  private async findLockedIncident(
    tx: DatabaseTransaction,
    id: string,
  ): Promise<LockedIncident | null> {
    const [row] = await tx
      .select({ incident: incidents, driver: drivers, customer: customers })
      .from(incidents)
      .innerJoin(orders, eq(orders.id, incidents.orderId))
      .innerJoin(customers, eq(customers.id, orders.customerId))
      .leftJoin(routes, eq(routes.id, orders.routeId))
      .leftJoin(drivers, eq(drivers.id, routes.driverId))
      .where(eq(incidents.id, id))
      .for('update', { of: incidents });

    return row ?? null;
  }

  private async hasActiveCall(
    tx: DatabaseTransaction,
    incidentId: string,
    driverPhone: string,
    { manualOnly = false }: { manualOnly?: boolean } = {},
  ): Promise<boolean> {
    const [activeCall] = await tx
      .select({ id: communications.id })
      .from(communications)
      .where(
        and(
          eq(communications.incidentId, incidentId),
          eq(communications.channel, 'voice'),
          eq(communications.direction, 'outbound'),
          eq(communications.toNumber, driverPhone),
          manualOnly
            ? or(
                isNull(communications.idempotencyKey),
                notLike(communications.idempotencyKey, mediationKeys.callPattern(incidentId)),
              )
            : undefined,
          or(
            eq(communications.status, 'in_progress'),
            and(
              inArray(communications.status, ['pending', 'queued']),
              gt(communications.createdAt, new Date(Date.now() - STALE_QUEUED_CALL_MS)),
            ),
          ),
        ),
      )
      .limit(1);

    return activeCall !== undefined;
  }

  private async prepareCall(
    tx: DatabaseTransaction,
    { incident, driver }: LockedIncident,
  ): Promise<PreparedCall> {
    if (driver === null) {
      throw new ConflictException('Incident has no driver assigned');
    }

    if (await this.hasActiveCall(tx, incident.id, driver.phone)) {
      throw new ConflictException('A call to the driver is already in progress');
    }

    return this.buildCall(incident, driver);
  }

  private buildCall(incident: IncidentRow, driver: DriverRow): PreparedCall {
    return {
      driver,
      ncco: buildDriverPromptNcco({
        locale: driver.locale,
        orderId: incident.orderId,
        inputUrl: this.voiceInputUrl(incident.id),
      }),
    };
  }

  private voiceInputUrl(incidentId: string): string {
    const publicUrl = this.config.get('PUBLIC_URL', { infer: true });

    if (publicUrl === undefined) {
      throw new Error(`Cannot call the driver of incident ${incidentId}: PUBLIC_URL is not set`);
    }

    return buildVoiceInputUrl(publicUrl, incidentId);
  }

  private async placeCall(
    tx: DatabaseTransaction,
    incidentId: string,
    { driver, ncco }: PreparedCall,
  ): Promise<CallAttempt> {
    let callId: string;

    try {
      ({ callId } = await this.vonage.createCall(driver.phone, ncco));
    } catch (error) {
      if (error instanceof VonageError) {
        return { ok: false, error };
      }

      throw error;
    }

    const [created] = await tx
      .insert(communications)
      .values({
        incidentId,
        channel: 'voice',
        direction: 'outbound',
        fromNumber: this.config.get('VONAGE_VIRTUAL_NUMBER', { infer: true }) ?? null,
        toNumber: driver.phone,
        vonageUuid: callId,
        status: 'queued',
      })
      .onConflictDoNothing({ target: communications.vonageUuid })
      .returning();

    if (created) {
      await publishCommunicationChange(tx, 'incident.communication_added', created);

      return { ok: true, call: created };
    }

    const existing = await tx
      .select()
      .from(communications)
      .where(eq(communications.vonageUuid, callId));

    return { ok: true, call: singleRow(existing) };
  }
}
