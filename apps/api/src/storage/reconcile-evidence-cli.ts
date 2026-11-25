import 'reflect-metadata';

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { validateEnv } from '../config/env.schema.js';
import { DATABASE } from '../database/database.constants.js';
import { DatabaseModule } from '../database/database.module.js';

import { reconcileEvidence } from './reconcile-evidence.js';
import { StorageModule } from './storage.module.js';
import { STORAGE_SERVICE } from './storage.service.js';

import type { StorageService } from './storage.service.js';
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
  const deleted = await reconcileEvidence(
    app.get<Database>(DATABASE),
    app.get<StorageService>(STORAGE_SERVICE),
  );
  process.stdout.write(`Deleted ${deleted} orphaned evidence objects.\n`);
} finally {
  await app.close();
}
