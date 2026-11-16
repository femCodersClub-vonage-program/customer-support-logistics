import 'reflect-metadata';

import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { APP_OPTIONS, configureApp } from './app-setup.js';
import { AppModule } from './app.module.js';
import { setupOpenApi } from './openapi/setup-openapi.js';

import type { Env } from './config/env.schema.js';
import type { NestExpressApplication } from '@nestjs/platform-express';

const app = await NestFactory.create<NestExpressApplication>(AppModule, APP_OPTIONS);
app.enableShutdownHooks();

const config = app.get<ConfigService<Env, true>>(ConfigService);
configureApp(app, { clientIpHeader: config.get('CLIENT_IP_HEADER', { infer: true }) });
setupOpenApi(app, config.get('NODE_ENV', { infer: true }));

await app.listen(config.get('PORT', { infer: true }));
