import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, gt, or } from 'drizzle-orm';

import { requireAgentId } from '../common/dev-auth/dev-actor.js';
import { DATABASE } from '../database/database.constants.js';
import { communications, drivers, incidents, orders, routes } from '../database/schema/index.js';
import { singleRow } from '../database/single-row.js';
import { buildDriverPromptNcco } from '../vonage/ncco.js';
import { buildVoiceInputUrl } from '../vonage/voice-urls.js';
import { VonageError } from '../vonage/vonage.errors.js';
import { VONAGE_SERVICE } from '../vonage/vonage.service.js';

import { toCommunication, toIncident } from './incidents.mapper.js';
import { persistTransition } from './persist-transition.js';

import type { CommunicationRow, DriverRow, IncidentRow } from './incidents.mapper.js';
import type { DevActor } from '../common/dev-auth/dev-actor.js';
import type { Env } from '../config/env.schema.js';
import type { Database, DatabaseTransaction } from '../database/database.constants.js';
import type { NccoAction } from '../vonage/ncco.js';
import type { VonageService } from '../vonage/vonage.service.js';
import type { StartMediationResponse } from '@csl/contracts';
import type { Communication } from '@csl/shared-types';

export const STALE_QUEUED_CALL_MS = 2 * 60 * 1000;

interface LockedIncident {
  incident: IncidentRow;
  driver: DriverRow | null;
}

interface PreparedCall {
  driver: DriverRow;
  ncco: NccoAction[];
}

type CallAttempt = { ok: true; call: CommunicationRow } | { ok: false; error: VonageError };

function unwrap(attempt: CallAttempt): CommunicationRow {
  if (!attempt.ok) {
    throw attempt.error;
  }

  return attempt.call;
}

@Injectable()
export class MediationService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(VONAGE_SERVICE) private readonly vonage: VonageService,
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>,
  ) {}

  async start(actor: DevActor, id: string): Promise<StartMediationResponse> {
    const agentId = requireAgentId(actor);

    const { incident, attempt } = await this.db.transaction(async (tx) => {
      const locked = await this.lockIncident(tx, id);
      const prepared = await this.prepareCall(tx, locked);
      let current = locked.incident;

      if (current.status !== 'in_mediation') {
        current = await persistTransition(tx, current, {
          to: 'in_mediation',
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
      }

      return { incident: current, attempt: await this.placeCall(tx, current.id, prepared) };
    });

    return { incident: toIncident(incident), call: toCommunication(unwrap(attempt)) };
  }

  async callDriver(actor: DevActor, id: string): Promise<Communication> {
    requireAgentId(actor);

    const attempt = await this.db.transaction(async (tx) => {
      const locked = await this.lockIncident(tx, id);

      if (locked.incident.status !== 'in_mediation') {
        throw new ConflictException('Incident is not in mediation');
      }

      return this.placeCall(tx, locked.incident.id, await this.prepareCall(tx, locked));
    });

    return toCommunication(unwrap(attempt));
  }

  private async lockIncident(tx: DatabaseTransaction, id: string): Promise<LockedIncident> {
    const [row] = await tx
      .select({ incident: incidents, driver: drivers })
      .from(incidents)
      .innerJoin(orders, eq(orders.id, incidents.orderId))
      .leftJoin(routes, eq(routes.id, orders.routeId))
      .leftJoin(drivers, eq(drivers.id, routes.driverId))
      .where(eq(incidents.id, id))
      .for('update', { of: incidents });

    if (!row) {
      throw new NotFoundException('Incident not found');
    }

    return row;
  }

  private async prepareCall(
    tx: DatabaseTransaction,
    { incident, driver }: LockedIncident,
  ): Promise<PreparedCall> {
    if (driver === null) {
      throw new ConflictException('Incident has no driver assigned');
    }

    const [activeCall] = await tx
      .select({ id: communications.id })
      .from(communications)
      .where(
        and(
          eq(communications.incidentId, incident.id),
          eq(communications.channel, 'voice'),
          eq(communications.direction, 'outbound'),
          eq(communications.toNumber, driver.phone),
          or(
            eq(communications.status, 'in_progress'),
            and(
              eq(communications.status, 'queued'),
              gt(communications.createdAt, new Date(Date.now() - STALE_QUEUED_CALL_MS)),
            ),
          ),
        ),
      )
      .limit(1);

    if (activeCall) {
      throw new ConflictException('A call to the driver is already in progress');
    }

    const publicUrl = this.config.get('PUBLIC_URL', { infer: true });

    if (publicUrl === undefined) {
      throw new Error(`Cannot call the driver of incident ${incident.id}: PUBLIC_URL is not set`);
    }

    return {
      driver,
      ncco: buildDriverPromptNcco({
        locale: driver.locale,
        orderId: incident.orderId,
        inputUrl: buildVoiceInputUrl(publicUrl, incident.id),
      }),
    };
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
      return { ok: true, call: created };
    }

    const existing = await tx
      .select()
      .from(communications)
      .where(eq(communications.vonageUuid, callId));

    return { ok: true, call: singleRow(existing) };
  }
}
