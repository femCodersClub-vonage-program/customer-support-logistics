import { Global, Inject, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { DATABASE, DATABASE_POOL } from './database.constants.js';
import { DatabaseHealth } from './database.health.js';
import * as schema from './schema/index.js';

import type { Env } from '../config/env.schema.js';
import type { OnApplicationShutdown } from '@nestjs/common';

@Global()
@Module({
  providers: [
    {
      provide: DATABASE_POOL,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const pool = new Pool({
          connectionString: config.get('DATABASE_URL', { infer: true }),
          connectionTimeoutMillis: 5000,
        });
        const logger = new Logger(DatabaseModule.name);
        pool.on('error', (error) => logger.error(`Idle database client error: ${error.message}`));
        return pool;
      },
    },
    {
      provide: DATABASE,
      inject: [DATABASE_POOL],
      useFactory: (pool: Pool) => drizzle({ client: pool, schema, casing: 'snake_case' }),
    },
    DatabaseHealth,
  ],
  exports: [DATABASE, DatabaseHealth],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
