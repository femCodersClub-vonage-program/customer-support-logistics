import { get } from 'node:http';

import { incidentSchema, incidentStreamEventSchema } from '@csl/contracts';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { IncidentEventsListener } from '../src/events/incident-events.listener.js';

import { createTestApp, resetDatabase } from './fixtures/app.js';
import { sessionCookieFor, sessionCookiesFor } from './fixtures/auth.js';
import { actor, ids, seed } from './fixtures/seed.js';

import type { TestApp } from './fixtures/app.js';
import type { IncidentStreamEvent } from '@csl/shared-types';
import type { IncomingMessage, Server } from 'node:http';
import type { AddressInfo } from 'node:net';

const EVENT_TIMEOUT_MS = 2000;

interface StreamMessage {
  id: string | undefined;
  data: IncidentStreamEvent;
}

interface OpenStream {
  response: IncomingMessage;
  next(): Promise<StreamMessage>;
  ended(): Promise<void>;
  close(): void;
}

function parseBlock(block: string): StreamMessage | null {
  const lines = block.split('\n');
  const data = lines
    .filter((line) => line.startsWith('data: '))
    .map((line) => line.slice('data: '.length))
    .join('\n');

  if (data === '') {
    return null;
  }

  const id = lines.find((line) => line.startsWith('id: '))?.slice('id: '.length);

  return { id, data: incidentStreamEventSchema.parse(JSON.parse(data)) };
}

async function listen(server: Server): Promise<number> {
  if (!server.listening) {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  }

  return (server.address() as AddressInfo).port;
}

async function openStream(testApp: TestApp, cookie: string): Promise<OpenStream> {
  const port = await listen(testApp.app.getHttpServer() as Server);
  const response = await new Promise<IncomingMessage>((resolve, reject) => {
    get(
      {
        host: '127.0.0.1',
        port,
        path: '/events/stream',
        headers: { cookie, accept: 'text/event-stream' },
      },
      resolve,
    ).on('error', reject);
  });

  const queued: StreamMessage[] = [];
  const waiting: ((message: StreamMessage) => void)[] = [];
  let buffer = '';

  response.setEncoding('utf8');
  response.on('data', (chunk: string) => {
    buffer += chunk;
    let end = buffer.indexOf('\n\n');

    while (end !== -1) {
      const message = parseBlock(buffer.slice(0, end));
      buffer = buffer.slice(end + 2);
      end = buffer.indexOf('\n\n');

      if (message !== null) {
        const resolve = waiting.shift();

        if (resolve) {
          resolve(message);
        } else {
          queued.push(message);
        }
      }
    }
  });

  const ended = new Promise<void>((resolve) => response.once('end', resolve));

  return {
    response,
    next: () => {
      const message = queued.shift();

      if (message) {
        return Promise.resolve(message);
      }

      return new Promise<StreamMessage>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`No event within ${EVENT_TIMEOUT_MS} ms`)),
          EVENT_TIMEOUT_MS,
        );

        waiting.push((value) => {
          clearTimeout(timer);
          resolve(value);
        });
      });
    },
    ended: () => ended,
    close: () => response.destroy(),
  };
}

describe('Events stream (e2e)', () => {
  let testApp: TestApp;
  let cookie: Record<keyof typeof actor, string>;
  const streams: OpenStream[] = [];

  const http = () => request(testApp.app.getHttpServer());

  const open = async (who: string = cookie.agentA) => {
    const stream = await openStream(testApp, who);
    streams.push(stream);
    return stream;
  };

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(testApp.db);
    await seed(testApp.db);
    cookie = await sessionCookiesFor(testApp, actor);
  });

  afterEach(() => {
    streams.splice(0).forEach((stream) => stream.close());
  });

  afterAll(async () => {
    await resetDatabase(testApp.db);
    await testApp.app.close();
  });

  it('returns 401 without a session', async () => {
    await http().get('/events/stream').expect(401);
  });

  it('returns 403 for a customer', async () => {
    await http().get('/events/stream').set('Cookie', cookie.ana).expect(403);
  });

  it('opens a Server-Sent Events stream for an agent', async () => {
    const stream = await open();

    expect(stream.response.statusCode).toBe(200);
    expect(stream.response.headers['content-type']).toMatch(/text\/event-stream/);
  });

  it('sends an event with an id after a status change', async () => {
    const stream = await open();

    const response = await http()
      .patch(`/incidents/${ids.openIncident}/status`)
      .set('Cookie', cookie.agentA)
      .send({ status: 'escalated' })
      .expect(200);
    const incident = incidentSchema.parse(response.body);

    const message = await stream.next();

    expect(message.id).toEqual(expect.any(String));
    expect(message.data).toEqual({
      type: 'incident.status_changed',
      incidentId: ids.openIncident,
      status: 'escalated',
      updatedAt: incident.updatedAt,
    });
  });

  it('sends the same change to every open stream', async () => {
    const agentB = await sessionCookieFor(testApp, { role: 'agent', id: ids.agentB });
    const first = await open(cookie.agentA);
    const second = await open(agentB);

    await http()
      .patch(`/incidents/${ids.openIncident}/status`)
      .set('Cookie', cookie.agentA)
      .send({ status: 'escalated' })
      .expect(200);

    const [a, b] = await Promise.all([first.next(), second.next()]);

    expect(a.data).toMatchObject({ type: 'incident.status_changed', incidentId: ids.openIncident });
    expect(b.data).toEqual(a.data);
  });

  it('sends an event when a customer creates an incident', async () => {
    const stream = await open();

    const response = await http()
      .post('/incidents')
      .set('Cookie', cookie.ana)
      .send({ orderId: ids.anaOrder, type: 'damaged' })
      .expect(201);
    const incident = incidentSchema.parse(response.body);

    expect((await stream.next()).data).toEqual({
      type: 'incident.created',
      incidentId: incident.id,
      status: 'open',
      updatedAt: incident.updatedAt,
    });
  });

  it('sends nothing for a rejected status change', async () => {
    const stream = await open();

    await http()
      .patch(`/incidents/${ids.resolvedIncident}/status`)
      .set('Cookie', cookie.agentA)
      .send({ status: 'escalated' })
      .expect(409);
    await http()
      .patch(`/incidents/${ids.openIncident}/status`)
      .set('Cookie', cookie.agentA)
      .send({ status: 'escalated' })
      .expect(200);

    expect((await stream.next()).data.incidentId).toBe(ids.openIncident);
  });

  describe('when the API stops listening to the database', () => {
    let isolated: TestApp;

    beforeEach(async () => {
      isolated = await createTestApp();
    });

    afterEach(async () => {
      await isolated.app.close();
    });

    it('ends the open streams and answers 503 to new ones', async () => {
      const agentCookie = await sessionCookieFor(isolated, actor.agentA);
      const stream = await openStream(isolated, agentCookie);
      streams.push(stream);

      await isolated.app.get(IncidentEventsListener).onModuleDestroy();
      await stream.ended();

      await request(isolated.app.getHttpServer())
        .get('/events/stream')
        .set('Cookie', agentCookie)
        .expect(503);
    });
  });
});
