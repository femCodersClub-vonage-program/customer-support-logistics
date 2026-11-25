import { sql } from 'drizzle-orm';

import { JOBS_SCHEMA } from '../../src/jobs/pg-boss-job-queue.js';

import type { TestApp } from './app.js';

export async function runDueJobs(testApp: TestApp): Promise<void> {
  await testApp.jobs.drain();
}

export async function advanceJobClock(testApp: TestApp, seconds: number): Promise<void> {
  await testApp.db.execute(
    sql`UPDATE ${sql.identifier(JOBS_SCHEMA)}.job SET start_after = start_after - make_interval(secs => ${seconds}) WHERE state IN ('created', 'retry')`,
  );
  await runDueJobs(testApp);
}

export async function pendingJobs(
  testApp: TestApp,
): Promise<{ name: string; data: unknown; delaySeconds: number }[]> {
  const { rows } = await testApp.db.execute<{ name: string; data: unknown; delay: number }>(
    sql`SELECT name, data, round(extract(epoch FROM start_after - now()))::int AS delay FROM ${sql.identifier(JOBS_SCHEMA)}.job WHERE state IN ('created', 'retry') ORDER BY start_after, created_on`,
  );

  return rows.map(({ name, data, delay }) => ({ name, data, delaySeconds: delay }));
}
