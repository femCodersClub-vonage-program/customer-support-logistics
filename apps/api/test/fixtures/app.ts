import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';

import { AppModule } from '../../src/app.module.js';
import { DATABASE } from '../../src/database/database.constants.js';
import { setupOpenApi } from '../../src/openapi/setup-openapi.js';
import { VONAGE_SERVICE } from '../../src/vonage/vonage.service.js';

import { FakeVonageService } from './fake-vonage.service.js';

import type { Database } from '../../src/database/database.constants.js';
import type { INestApplication } from '@nestjs/common';
import type { TestingModuleBuilder } from '@nestjs/testing';

export interface TestApp {
  app: INestApplication;
  db: Database;
  vonage: FakeVonageService;
}

export async function createTestApp(
  customize: (builder: TestingModuleBuilder) => TestingModuleBuilder = (builder) => builder,
): Promise<TestApp> {
  const vonage = new FakeVonageService();
  const builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(VONAGE_SERVICE)
    .useValue(vonage);
  const moduleRef = await customize(builder).compile();
  const app = moduleRef.createNestApplication({ rawBody: true });

  setupOpenApi(app, 'development');
  await app.init();

  return { app, db: app.get<Database>(DATABASE), vonage };
}

export async function waitForLockWait(db: Database, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const { rows } = await db.execute<{ waiting: number }>(
      sql`SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`,
    );

    if ((rows[0]?.waiting ?? 0) > 0) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  throw new Error(`No query waited for a lock within ${timeoutMs}ms`);
}

export async function resetDatabase(db: Database): Promise<void> {
  await db.execute(
    sql`TRUNCATE sessions, incident_events, webhook_events, communications, evidence, incidents, orders, routes, drivers, customers, agents CASCADE`,
  );
}
