import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { evidence } from '../src/database/schema/index.js';
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

  it('creates a pending evidence record and a presigned upload URL', async () => {
    const response = await http()
      .post(`/incidents/${ids.openIncident}/evidence/upload-url`)
      .set('Cookie', cookie.ana)
      .send({ fileName: 'parcel.jpg', mimeType: 'image/jpeg', sizeBytes: 100 })
      .expect(201);
    expect(response.body.uploadUrl).toContain('https://storage.test/upload/incidents/');
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
