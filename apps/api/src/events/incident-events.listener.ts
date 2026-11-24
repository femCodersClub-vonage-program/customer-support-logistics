import { randomUUID } from 'node:crypto';

import { incidentStreamEventSchema } from '@csl/contracts';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Subject } from 'rxjs';

import { INCIDENT_EVENTS_CHANNEL } from './publish-incident-event.js';

import type { IncidentStreamEvent } from '@csl/shared-types';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { Notification } from 'pg';
import type { Observable } from 'rxjs';

export const LISTEN_CLIENT_FACTORY = Symbol('LISTEN_CLIENT_FACTORY');

export const LISTEN_RETRY_DELAYS_MS = [1000, 2000, 5000, 10_000] as const;

export interface ListenClient {
  connect(): Promise<unknown>;
  query(text: string): Promise<unknown>;
  end(): Promise<void>;
  on(event: 'notification', listener: (message: Notification) => void): unknown;
  on(event: 'error', listener: (error: Error) => void): unknown;
  on(event: 'end', listener: () => void): unknown;
}

export type ListenClientFactory = () => ListenClient;

export interface StreamedIncidentEvent {
  id: string;
  event: IncidentStreamEvent;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

@Injectable()
export class IncidentEventsListener implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IncidentEventsListener.name);
  private events = new Subject<StreamedIncidentEvent>();
  private client: ListenClient | null = null;
  private connected = false;
  private stopped = false;
  private attempt = 0;
  private retryTimer: NodeJS.Timeout | undefined;

  constructor(@Inject(LISTEN_CLIENT_FACTORY) private readonly createClient: ListenClientFactory) {}

  get listening(): boolean {
    return this.connected;
  }

  stream(): Observable<StreamedIncidentEvent> {
    return this.events.asObservable();
  }

  onModuleInit(): Promise<void> {
    return this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.retryTimer);
    this.closeStreams();

    const client = this.client;
    this.client = null;
    this.connected = false;

    await client?.end().catch(() => undefined);
  }

  private async connect(): Promise<void> {
    const client = this.createClient();
    this.client = client;

    client.on('notification', (message) => this.receive(message));
    client.on('error', (error) => this.lose(client, error));
    client.on('end', () => this.lose(client));

    try {
      await client.connect();
      await client.query(`LISTEN ${INCIDENT_EVENTS_CHANNEL}`);
    } catch (error) {
      this.lose(client, error);
      return;
    }

    if (this.client !== client) {
      return;
    }

    if (this.attempt > 0) {
      this.logger.log(`Listening to ${INCIDENT_EVENTS_CHANNEL} again`);
    }

    this.attempt = 0;
    this.connected = true;
  }

  private lose(client: ListenClient, error?: unknown): void {
    if (this.client !== client) {
      return;
    }

    this.client = null;
    this.connected = false;
    this.closeStreams();
    void client.end().catch(() => undefined);

    if (this.stopped) {
      return;
    }

    const delay = LISTEN_RETRY_DELAYS_MS[Math.min(this.attempt, LISTEN_RETRY_DELAYS_MS.length - 1)];
    this.attempt += 1;

    this.logger.warn(
      `Stopped listening to ${INCIDENT_EVENTS_CHANNEL}${error === undefined ? '' : `: ${describe(error)}`}. Retrying in ${delay} ms`,
    );

    this.retryTimer = setTimeout(() => void this.connect(), delay);
  }

  private receive(message: Notification): void {
    if (message.channel !== INCIDENT_EVENTS_CHANNEL || message.payload === undefined) {
      return;
    }

    let payload: unknown;

    try {
      payload = JSON.parse(message.payload);
    } catch {
      this.logger.warn(`Ignored a ${INCIDENT_EVENTS_CHANNEL} notification that is not JSON`);
      return;
    }

    const result = incidentStreamEventSchema.safeParse(payload);

    if (!result.success) {
      this.logger.warn(`Ignored an invalid ${INCIDENT_EVENTS_CHANNEL} notification`);
      return;
    }

    this.events.next({ id: randomUUID(), event: result.data });
  }

  private closeStreams(): void {
    this.events.complete();
    this.events = new Subject<StreamedIncidentEvent>();
  }
}
