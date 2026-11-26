import { eq, sql } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { evidence, incidentEvents } from '../src/database/schema/index.js';
import { reconcileEvidence } from '../src/storage/reconcile-evidence.js';
import { STORAGE_SERVICE } from '../src/storage/storage.service.js';

import { createTestApp, resetDatabase } from './fixtures/app.js';
import { sessionCookiesFor } from './fixtures/auth.js';
import { FakeStorageService } from './fixtures/fake-storage.service.js';
import { actor, ids, seed } from './fixtures/seed.js';

import type { TestApp } from './fixtures/app.js';

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);

describe('Evidence uploads (e2e)', () => {
  let testApp: TestApp;
  let cookie: Record<keyof typeof actor, string>;
  const storage = new FakeStorageService();
  const http = () => request(testApp.app.getHttpServer());

  beforeAll(async () => {
    testApp = await createTestApp((builder) =>
      builder.overrideProvider(STORAGE_SERVICE).useValue(storage),
    );
  });
  beforeEach(async () => {
    storage.objects.clear();
    storage.prefixes.clear();
    await resetDatabase(testApp.db);
    await seed(testApp.db);
    cookie = await sessionCookiesFor(testApp, actor);
  });
  afterAll(async () => {
    await resetDatabase(testApp.db);
    await testApp.app.close();
  });

  it('reconciles orphaned copies while keeping ready evidence and temporary uploads', async () => {
    const readyKey = `incidents/${ids.openIncident}/ready/11111111-1111-4111-8111-111111111111.jpg`;
    const orphanKey = `incidents/${ids.openIncident}/ready/22222222-2222-4222-8222-222222222222.jpg`;
    const heifOrphanKey = `incidents/${ids.openIncident}/ready/33333333-3333-4333-8333-333333333333.heif`;
    const unrelatedKeys = [
      `incidents/${ids.openIncident}/report.pdf`,
      `incidents/${ids.openIncident}/ready/report.jpg`,
      `incidents/${ids.openIncident}/ready/22222222-2222-4222-8222-222222222222.pdf`,
      `incidents/${ids.openIncident}/ready/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.JPG`,
      `incidents/${ids.openIncident}/ready/AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA.jpg`,
    ];
    const pendingKey = `evidence-pending/${ids.openIncident}/pending.jpg`;
    for (const key of [readyKey, orphanKey, heifOrphanKey, pendingKey, ...unrelatedKeys])
      storage.objects.set(key, { sizeBytes: 4, contentType: 'image/jpeg' });
    await testApp.db.insert(evidence).values({
      incidentId: ids.openIncident,
      storageKey: readyKey,
      mimeType: 'image/jpeg',
      sizeBytes: 4,
      status: 'ready',
    });
    const onCandidate = vi.fn();
    expect(await reconcileEvidence(testApp.db, storage, { mode: 'preview', onCandidate })).toBe(2);
    expect(onCandidate).toHaveBeenCalledTimes(2);
    expect(onCandidate).toHaveBeenCalledWith(orphanKey);
    expect(onCandidate).toHaveBeenCalledWith(heifOrphanKey);
    expect(storage.objects.has(orphanKey)).toBe(true);
    expect(storage.objects.has(heifOrphanKey)).toBe(true);

    expect(await reconcileEvidence(testApp.db, storage, { mode: 'apply' })).toBe(2);
    expect(storage.objects.has(orphanKey)).toBe(false);
    expect(storage.objects.has(heifOrphanKey)).toBe(false);
    expect(storage.objects.has(readyKey)).toBe(true);
    expect(storage.objects.has(pendingKey)).toBe(true);
    for (const key of unrelatedKeys) expect(storage.objects.has(key)).toBe(true);
    const transaction = vi.spyOn(testApp.db, 'transaction');
    try {
      expect(await reconcileEvidence(testApp.db, storage, { mode: 'apply' })).toBe(0);
      expect(transaction).not.toHaveBeenCalled();
    } finally {
      transaction.mockRestore();
    }
  });

  it('waits for an in-flight completion before reconciling its final copy', async () => {
    const response = await http()
      .post(`/incidents/${ids.openIncident}/evidence/upload-url`)
      .set('Cookie', cookie.ana)
      .send({ fileName: 'parcel.jpg', mimeType: 'image/jpeg', sizeBytes: 4 })
      .expect(201);
    const [pending] = await testApp.db
      .select()
      .from(evidence)
      .where(eq(evidence.id, response.body.evidenceId));
    storage.objects.set(pending!.storageKey, { sizeBytes: 4, contentType: 'image/jpeg' });
    storage.prefixes.set(pending!.storageKey, jpeg);
    let release!: () => void;
    let copied!: () => void;
    const copyReady = new Promise<void>((resolve) => {
      copied = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const originalCopy = storage.copyObject.bind(storage);
    const copySpy = vi
      .spyOn(storage, 'copyObject')
      .mockImplementation(async (source, destination) => {
        await originalCopy(source, destination);
        copied();
        await gate;
      });
    const completion = http()
      .post(`/incidents/${ids.openIncident}/evidence/${response.body.evidenceId}/complete`)
      .set('Cookie', cookie.ana)
      .then((result) => result);
    await copyReady;
    const sweep = reconcileEvidence(testApp.db, storage, { mode: 'apply' });
    try {
      await vi.waitFor(async () => {
        const waiting = await testApp.db.execute(
          sql`SELECT 1 FROM pg_locks WHERE NOT granted AND locktype = 'transactionid' AND database IS NULL`,
        );
        expect(waiting.rows.length).toBeGreaterThan(0);
      });
    } finally {
      release();
      copySpy.mockRestore();
      await Promise.all([completion, sweep]);
    }
    expect((await completion).status).toBe(201);
    expect(await sweep).toBe(0);
    const [ready] = await testApp.db
      .select()
      .from(evidence)
      .where(eq(evidence.id, response.body.evidenceId));
    expect(storage.objects.has(ready!.storageKey)).toBe(true);
  });

  it('creates a pending evidence record and a presigned upload URL', async () => {
    const response = await http()
      .post(`/incidents/${ids.openIncident}/evidence/upload-url`)
      .set('Cookie', cookie.ana)
      .send({ fileName: 'parcel.jpg', mimeType: 'image/jpeg', sizeBytes: 100 })
      .expect(201);
    expect(response.body.uploadUrl).toContain('https://storage.test/upload/evidence-pending/');
    const [row] = await testApp.db
      .select()
      .from(evidence)
      .where(eq(evidence.id, response.body.evidenceId));
    expect(row).toMatchObject({
      incidentId: ids.openIncident,
      mimeType: 'image/jpeg',
      sizeBytes: 100,
      status: 'pending',
    });
  });

  it('rejects an unsupported type and an oversized image', async () => {
    await http()
      .post(`/incidents/${ids.openIncident}/evidence/upload-url`)
      .set('Cookie', cookie.ana)
      .send({ fileName: 'x.pdf', mimeType: 'application/pdf', sizeBytes: 1 })
      .expect(400);
    await http()
      .post(`/incidents/${ids.openIncident}/evidence/upload-url`)
      .set('Cookie', cookie.ana)
      .send({ fileName: 'x.jpg', mimeType: 'image/jpeg', sizeBytes: 10 * 1024 * 1024 + 1 })
      .expect(413);
  });

  it('does not expose another customer incident', async () => {
    await http()
      .post(`/incidents/${ids.openIncident}/evidence/upload-url`)
      .set('Cookie', cookie.bruno)
      .send({ fileName: 'x.jpg', mimeType: 'image/jpeg', sizeBytes: 1 })
      .expect(404);
  });

  it('returns 409 when completing an upload whose object is absent', async () => {
    const { body } = await http()
      .post(`/incidents/${ids.openIncident}/evidence/upload-url`)
      .set('Cookie', cookie.ana)
      .send({ fileName: 'x.jpg', mimeType: 'image/jpeg', sizeBytes: 4 })
      .expect(201);
    await http()
      .post(`/incidents/${ids.openIncident}/evidence/${body.evidenceId}/complete`)
      .set('Cookie', cookie.ana)
      .expect(409);
  });

  it('confirms matching content and lists it with a signed download URL', async () => {
    const { body } = await http()
      .post(`/incidents/${ids.openIncident}/evidence/upload-url`)
      .set('Cookie', cookie.ana)
      .send({ fileName: 'x.jpg', mimeType: 'image/jpeg', sizeBytes: 4 })
      .expect(201);
    const [row] = await testApp.db.select().from(evidence).where(eq(evidence.id, body.evidenceId));
    storage.objects.set(row!.storageKey, { contentType: 'image/jpeg', sizeBytes: 4 });
    storage.prefixes.set(row!.storageKey, jpeg);
    await http()
      .post(`/incidents/${ids.openIncident}/evidence/${body.evidenceId}/complete`)
      .set('Cookie', cookie.ana)
      .expect(201);
    const events = await testApp.db
      .select()
      .from(incidentEvents)
      .where(eq(incidentEvents.incidentId, ids.openIncident));
    expect(events).toContainEqual(
      expect.objectContaining({ kind: 'evidence_uploaded', reason: 'Evidence uploaded' }),
    );
    const response = await http()
      .get(`/incidents/${ids.openIncident}/evidence`)
      .set('Cookie', cookie.agentA)
      .expect(200);
    expect(response.body).toEqual([
      expect.objectContaining({
        id: body.evidenceId,
        downloadUrl: expect.stringContaining('https://storage.test/download/'),
      }),
    ]);
  });

  it('rejects an uploaded object whose bytes do not match its declared MIME type', async () => {
    const { body } = await http()
      .post(`/incidents/${ids.openIncident}/evidence/upload-url`)
      .set('Cookie', cookie.ana)
      .send({ fileName: 'x.jpg', mimeType: 'image/jpeg', sizeBytes: 4 })
      .expect(201);
    const [row] = await testApp.db.select().from(evidence).where(eq(evidence.id, body.evidenceId));
    storage.objects.set(row!.storageKey, { contentType: 'image/jpeg', sizeBytes: 4 });
    storage.prefixes.set(row!.storageKey, new Uint8Array([1, 2, 3, 4]));
    await http()
      .post(`/incidents/${ids.openIncident}/evidence/${body.evidenceId}/complete`)
      .set('Cookie', cookie.ana)
      .expect(400);
  });

  it('keeps completed evidence available if deleting the temporary object fails', async () => {
    const { body } = await http()
      .post(`/incidents/${ids.openIncident}/evidence/upload-url`)
      .set('Cookie', cookie.ana)
      .send({ fileName: 'x.jpg', mimeType: 'image/jpeg', sizeBytes: 4 })
      .expect(201);
    const [row] = await testApp.db.select().from(evidence).where(eq(evidence.id, body.evidenceId));
    storage.objects.set(row!.storageKey, { contentType: 'image/jpeg', sizeBytes: 4 });
    storage.prefixes.set(row!.storageKey, jpeg);
    const failure = vi
      .spyOn(storage, 'deleteObject')
      .mockRejectedValueOnce(new Error('storage unavailable'));
    try {
      await http()
        .post(`/incidents/${ids.openIncident}/evidence/${body.evidenceId}/complete`)
        .set('Cookie', cookie.ana)
        .expect(201);
      const [ready] = await testApp.db
        .select()
        .from(evidence)
        .where(eq(evidence.id, body.evidenceId));
      expect(ready!.status).toBe('ready');
      expect(storage.prefixes.get(ready!.storageKey)).toEqual(jpeg);
    } finally {
      failure.mockRestore();
    }
  });

  it('enforces the configured maximum number of files per incident', async () => {
    for (let index = 0; index < 5; index += 1) {
      await http()
        .post(`/incidents/${ids.openIncident}/evidence/upload-url`)
        .set('Cookie', cookie.ana)
        .send({ fileName: `x-${index}.jpg`, mimeType: 'image/jpeg', sizeBytes: 1 })
        .expect(201);
    }
    await http()
      .post(`/incidents/${ids.openIncident}/evidence/upload-url`)
      .set('Cookie', cookie.ana)
      .send({ fileName: 'x-6.jpg', mimeType: 'image/jpeg', sizeBytes: 1 })
      .expect(409);
  });

  it('enforces the quota when upload requests arrive concurrently', async () => {
    const responses = await Promise.all(
      Array.from({ length: 8 }, () =>
        http()
          .post(`/incidents/${ids.openIncident}/evidence/upload-url`)
          .set('Cookie', cookie.ana)
          .send({ fileName: 'x.jpg', mimeType: 'image/jpeg', sizeBytes: 4 }),
      ),
    );
    expect(responses.filter((response) => response.status === 201)).toHaveLength(5);
    expect(responses.filter((response) => response.status === 409)).toHaveLength(3);
  });

  it('records one event for concurrent completion requests', async () => {
    const { body } = await http()
      .post(`/incidents/${ids.openIncident}/evidence/upload-url`)
      .set('Cookie', cookie.ana)
      .send({ fileName: 'x.jpg', mimeType: 'image/jpeg', sizeBytes: 4 })
      .expect(201);
    const [row] = await testApp.db.select().from(evidence).where(eq(evidence.id, body.evidenceId));
    storage.objects.set(row!.storageKey, { contentType: 'image/jpeg', sizeBytes: 4 });
    storage.prefixes.set(row!.storageKey, jpeg);
    const responses = await Promise.all(
      Array.from({ length: 2 }, () =>
        http()
          .post(`/incidents/${ids.openIncident}/evidence/${body.evidenceId}/complete`)
          .set('Cookie', cookie.ana),
      ),
    );
    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    const events = await testApp.db
      .select()
      .from(incidentEvents)
      .where(eq(incidentEvents.incidentId, ids.openIncident));
    expect(events.filter((event) => event.kind === 'evidence_uploaded')).toHaveLength(1);
    const [ready] = await testApp.db
      .select()
      .from(evidence)
      .where(eq(evidence.id, body.evidenceId));
    expect(ready!.storageKey).not.toBe(row!.storageKey);
    expect(storage.prefixes.get(ready!.storageKey)).toEqual(jpeg);
  });

  it('removes expired pending evidence before allocating a new upload slot', async () => {
    const { body } = await http()
      .post(`/incidents/${ids.openIncident}/evidence/upload-url`)
      .set('Cookie', cookie.ana)
      .send({ fileName: 'expired.jpg', mimeType: 'image/jpeg', sizeBytes: 4 })
      .expect(201);
    const [expired] = await testApp.db
      .select()
      .from(evidence)
      .where(eq(evidence.id, body.evidenceId));
    storage.objects.set(expired!.storageKey, { contentType: 'image/jpeg', sizeBytes: 4 });
    storage.prefixes.set(expired!.storageKey, jpeg);
    await testApp.db
      .update(evidence)
      .set({ createdAt: new Date(Date.now() - 60 * 60 * 1000 - 1) })
      .where(eq(evidence.id, body.evidenceId));

    const response = await http()
      .post(`/incidents/${ids.openIncident}/evidence/upload-url`)
      .set('Cookie', cookie.ana)
      .send({ fileName: 'replacement.jpg', mimeType: 'image/jpeg', sizeBytes: 4 })
      .expect(201);

    expect(response.body.evidenceId).not.toBe(body.evidenceId);
    expect(storage.objects.has(expired!.storageKey)).toBe(false);
    expect(
      await testApp.db.select().from(evidence).where(eq(evidence.id, body.evidenceId)),
    ).toEqual([]);
  });

  it('does not list evidence for another customer incident', async () => {
    await http()
      .get(`/incidents/${ids.openIncident}/evidence`)
      .set('Cookie', cookie.bruno)
      .expect(404);
  });

  it.each([
    [
      'image/heic',
      'x.heic',
      new Uint8Array([0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]),
    ],
    [
      'image/heic',
      'x.heic',
      new Uint8Array([0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x69, 0x66, 0x31]),
    ],
    [
      'image/heif',
      'x.heif',
      new Uint8Array([0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x69, 0x66, 0x31]),
    ],
    [
      'video/mp4',
      'x.mp4',
      new Uint8Array([0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]),
    ],
    [
      'video/quicktime',
      'x.mov',
      new Uint8Array([0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70, 0x71, 0x74, 0x20, 0x20]),
    ],
  ])('accepts a valid %s binary signature', async (mimeType, fileName, prefix) => {
    const { body } = await http()
      .post(`/incidents/${ids.openIncident}/evidence/upload-url`)
      .set('Cookie', cookie.ana)
      .send({ fileName, mimeType, sizeBytes: prefix.length })
      .expect(201);
    const [row] = await testApp.db.select().from(evidence).where(eq(evidence.id, body.evidenceId));
    storage.objects.set(row!.storageKey, { contentType: mimeType, sizeBytes: prefix.length });
    storage.prefixes.set(row!.storageKey, prefix);
    await http()
      .post(`/incidents/${ids.openIncident}/evidence/${body.evidenceId}/complete`)
      .set('Cookie', cookie.ana)
      .expect(201);
  });
});