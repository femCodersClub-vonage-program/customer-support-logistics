import { EventEmitter } from 'node:events';

import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { IncidentEventsListener, LISTEN_RETRY_DELAYS_MS } from './incident-events.listener.js';
import { INCIDENT_EVENTS_CHANNEL } from './publish-incident-event.js';

import type { ListenClient, StreamedIncidentEvent } from './incident-events.listener.js';
import type { IncidentStreamEvent } from '@csl/shared-types';

const event: IncidentStreamEvent = {
  type: 'incident.created',
  incidentId: '00000000-0000-4000-8000-000000000001',
  status: 'open',
  updatedAt: '2026-11-24T10:00:00.000Z',
};

class FakeClient extends EventEmitter implements ListenClient {
  queries: string[] = [];
  ended = false;

  constructor(private readonly failure?: Error) {
    super();
  }

  connect(): Promise<void> {
    return this.failure ? Promise.reject(this.failure) : Promise.resolve();
  }

  query(text: string): Promise<void> {
    this.queries.push(text);
    return Promise.resolve();
  }

  end(): Promise<void> {
    this.ended = true;
    return Promise.resolve();
  }

  notify(payload: string | undefined, channel = INCIDENT_EVENTS_CHANNEL): void {
    this.emit('notification', { processId: 1, channel, payload });
  }
}

function setUp(...failures: (Error | undefined)[]) {
  const clients: FakeClient[] = [];
  const listener = new IncidentEventsListener(() => {
    const client = new FakeClient(failures[clients.length]);
    clients.push(client);
    return client;
  });

  return { listener, clients };
}

function collect(listener: IncidentEventsListener) {
  const received: StreamedIncidentEvent[] = [];
  let completed = false;

  listener.stream().subscribe({
    next: (value) => received.push(value),
    complete: () => {
      completed = true;
    },
  });

  return {
    received,
    completed: () => completed,
  };
}

describe('IncidentEventsListener', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('listens to the incident events channel on start', async () => {
    const { listener, clients } = setUp();

    await listener.onModuleInit();

    expect(listener.listening).toBe(true);
    expect(clients[0]?.queries).toEqual([`LISTEN ${INCIDENT_EVENTS_CHANNEL}`]);
  });

  it('streams each valid notification with a new id', async () => {
    const { listener, clients } = setUp();
    await listener.onModuleInit();
    const stream = collect(listener);

    clients[0]?.notify(JSON.stringify(event));
    clients[0]?.notify(JSON.stringify(event));

    expect(stream.received.map((value) => value.event)).toEqual([event, event]);
    expect(new Set(stream.received.map((value) => value.id)).size).toBe(2);
  });

  it.each([
    ['not JSON', 'not json'],
    ['not an incident event', JSON.stringify({ ...event, type: 'order.created' })],
    ['empty', undefined],
  ])('ignores a notification that is %s', async (_case, payload) => {
    const { listener, clients } = setUp();
    await listener.onModuleInit();
    const stream = collect(listener);

    clients[0]?.notify(payload);

    expect(stream.received).toEqual([]);
  });

  it('ignores notifications from other channels', async () => {
    const { listener, clients } = setUp();
    await listener.onModuleInit();
    const stream = collect(listener);

    clients[0]?.notify(JSON.stringify(event), 'other_channel');

    expect(stream.received).toEqual([]);
  });

  it('ends the open streams and listens again after losing the connection', async () => {
    const { listener, clients } = setUp();
    await listener.onModuleInit();
    const stream = collect(listener);

    clients[0]?.emit('error', new Error('terminating connection'));

    expect(listener.listening).toBe(false);
    expect(stream.completed()).toBe(true);
    expect(clients[0]?.ended).toBe(true);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('terminating connection'));

    await vi.advanceTimersByTimeAsync(LISTEN_RETRY_DELAYS_MS[0]);

    expect(listener.listening).toBe(true);
    expect(clients).toHaveLength(2);

    const next = collect(listener);
    clients[1]?.notify(JSON.stringify(event));

    expect(next.received.map((value) => value.event)).toEqual([event]);
  });

  it('handles a lost connection once when the client reports both an error and its end', async () => {
    const { listener, clients } = setUp();
    await listener.onModuleInit();

    clients[0]?.emit('error', new Error('gone'));
    clients[0]?.emit('end');
    await vi.advanceTimersByTimeAsync(LISTEN_RETRY_DELAYS_MS[0]);

    expect(clients).toHaveLength(2);
  });

  it('waits longer after each failed attempt and starts again after one works', async () => {
    const down = new Error('connection refused');
    const { listener, clients } = setUp(down, down, down);

    await listener.onModuleInit();
    expect(listener.listening).toBe(false);

    await vi.advanceTimersByTimeAsync(LISTEN_RETRY_DELAYS_MS[0]);
    expect(clients).toHaveLength(2);

    await vi.advanceTimersByTimeAsync(LISTEN_RETRY_DELAYS_MS[1] - 1);
    expect(clients).toHaveLength(2);

    await vi.advanceTimersByTimeAsync(1);
    expect(clients).toHaveLength(3);

    await vi.advanceTimersByTimeAsync(LISTEN_RETRY_DELAYS_MS[2]);
    expect(clients).toHaveLength(4);
    expect(listener.listening).toBe(true);

    clients[3]?.emit('end');
    await vi.advanceTimersByTimeAsync(LISTEN_RETRY_DELAYS_MS[0]);
    expect(clients).toHaveLength(5);
  });

  it('closes the connection and the streams on shutdown without listening again', async () => {
    const { listener, clients } = setUp();
    await listener.onModuleInit();
    const stream = collect(listener);

    await listener.onModuleDestroy();
    clients[0]?.emit('end');
    await vi.advanceTimersByTimeAsync(LISTEN_RETRY_DELAYS_MS.at(-1) ?? 0);

    expect(listener.listening).toBe(false);
    expect(stream.completed()).toBe(true);
    expect(clients[0]?.ended).toBe(true);
    expect(clients).toHaveLength(1);
  });

  it('stops retrying on shutdown', async () => {
    const { listener, clients } = setUp(new Error('connection refused'));
    await listener.onModuleInit();

    await listener.onModuleDestroy();
    await vi.advanceTimersByTimeAsync(LISTEN_RETRY_DELAYS_MS.at(-1) ?? 0);

    expect(clients).toHaveLength(1);
  });
});
