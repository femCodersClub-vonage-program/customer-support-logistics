import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sql } from 'drizzle-orm';
import { fromDrizzle, PgBoss } from 'pg-boss';

import { JOB_NAMES } from './job-queue.js';

import type { JobHandler, JobName, JobPayloads, JobQueue, SendJobOptions } from './job-queue.js';
import type { Env } from '../config/env.schema.js';
import type { DatabaseTransaction } from '../database/database.constants.js';
import type { BeforeApplicationShutdown, OnApplicationBootstrap } from '@nestjs/common';

export const JOBS_SCHEMA = 'pgboss';

const JOBS_POOL_SIZE = 5;

@Injectable()
export class PgBossJobQueue implements JobQueue, OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly logger = new Logger(PgBossJobQueue.name);
  private readonly boss: PgBoss;
  private readonly pollingIntervalSeconds: number;
  private readonly handlers = new Map<JobName, JobHandler<JobName>>();

  constructor(@Inject(ConfigService) config: ConfigService<Env, true>) {
    this.boss = new PgBoss({
      connectionString: config.get('DATABASE_URL', { infer: true }),
      schema: JOBS_SCHEMA,
      max: JOBS_POOL_SIZE,
    });
    this.pollingIntervalSeconds = config.get('JOBS_POLLING_INTERVAL_SECONDS', { infer: true });
    this.boss.on('error', (error: Error) => this.logger.error(`pg-boss: ${error.message}`));
  }

  async send<N extends JobName>(
    tx: DatabaseTransaction,
    name: N,
    data: JobPayloads[N],
    { delaySeconds = 0 }: SendJobOptions = {},
  ): Promise<void> {
    await this.boss.send(name, data, {
      startAfter: delaySeconds,
      db: fromDrizzle(tx, sql),
    });
  }

  work<N extends JobName>(name: N, handler: JobHandler<N>): void {
    if (this.handlers.has(name)) {
      throw new Error(`A worker for ${name} is already registered`);
    }

    this.handlers.set(name, handler as JobHandler<JobName>);
  }

  async drain(): Promise<void> {
    await this.boss.drain();
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.boss.start();

    for (const name of JOB_NAMES) {
      if ((await this.boss.getQueue(name)) === null) {
        await this.boss.createQueue(name);
      }
    }

    for (const [name, handler] of this.handlers) {
      await this.boss.work<JobPayloads[typeof name]>(
        name,
        { pollingIntervalSeconds: this.pollingIntervalSeconds, batchSize: 1 },
        async (jobs) => {
          for (const job of jobs) {
            await handler(job.data);
          }
        },
      );
    }
  }

  async beforeApplicationShutdown(): Promise<void> {
    await this.boss.stop({ graceful: true });
  }
}
