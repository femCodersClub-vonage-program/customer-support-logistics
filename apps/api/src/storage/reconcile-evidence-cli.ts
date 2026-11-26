import 'reflect-metadata';

import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { validateEnv } from '../config/env.schema.js';
import { DATABASE } from '../database/database.constants.js';
import { DatabaseModule } from '../database/database.module.js';

import { shouldApplyReconciliation } from './reconcile-evidence-target.js';
import { reconcileEvidence } from './reconcile-evidence.js';
import { StorageModule } from './storage.module.js';
import { STORAGE_SERVICE } from './storage.service.js';

import type { StorageService } from './storage.service.js';
import type { Env } from '../config/env.schema.js';
import type { Database } from '../database/database.constants.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    DatabaseModule,
    StorageModule,
  ],
})
class ReconciliationModule {}

const app = await NestFactory.createApplicationContext(ReconciliationModule);
try {
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const apply = shouldApplyReconciliation(
    process.argv.slice(2),
    config.get('DATABASE_URL', { infer: true }),
    config.get('STORAGE_BUCKET', { infer: true }),
  );
  const count = await reconcileEvidence(
    app.get<Database>(DATABASE),
    app.get<StorageService>(STORAGE_SERVICE),
    apply
      ? { mode: 'apply' }
      : {
          mode: 'preview',
          onCandidate: (key) => process.stdout.write(`Candidate: ${key}\n`),
        },
  );
  process.stdout.write(
    apply
      ? `Deleted ${count} orphaned evidence objects.\n`
      : `Found ${count} deletion candidates. No objects were deleted.\n`,
  );
} finally {
  await app.close();
}
