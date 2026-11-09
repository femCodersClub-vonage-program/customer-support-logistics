import 'reflect-metadata';

import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module.js';
import { setupOpenApi } from './openapi/setup-openapi.js';

import type { Env } from './config/env.schema.js';

const app = await NestFactory.create(AppModule);
app.enableShutdownHooks();

const config = app.get<ConfigService<Env, true>>(ConfigService);
setupOpenApi(app, config.get('NODE_ENV', { infer: true }));

await app.listen(config.get('PORT', { infer: true }));
