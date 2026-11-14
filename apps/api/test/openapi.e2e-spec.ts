import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp } from './fixtures/app.js';

import type { TestApp } from './fixtures/app.js';

describe('OpenAPI (e2e)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  it('serves the Swagger UI at /docs', async () => {
    await request(testApp.app.getHttpServer())
      .get('/docs')
      .expect(200)
      .expect('Content-Type', /text\/html/);
  });

  it('serves the OpenAPI document generated from the contracts', async () => {
    const response = await request(testApp.app.getHttpServer()).get('/docs/json').expect(200);
    const document = response.body as {
      openapi: string;
      paths: Record<string, Record<string, unknown>>;
      components: { schemas: Record<string, unknown> };
    };

    expect(document.openapi).toBe('3.1.0');
    expect(Object.keys(document.paths)).toEqual([
      '/incidents',
      '/incidents/{id}',
      '/incidents/{id}/status',
      '/incidents/{id}/mediation',
      '/incidents/{id}/mediation/driver-call',
      '/orders',
    ]);
    expect(Object.keys(document.paths['/incidents'] ?? {})).toEqual(['post', 'get']);
    expect(document.components.schemas).toHaveProperty('ApiErrorResponse');
    expect(document.components.schemas).toHaveProperty('IncidentStatus');
    expect(document.components.schemas).toHaveProperty('StartMediationResponse');
  });
});
