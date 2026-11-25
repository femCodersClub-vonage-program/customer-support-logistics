import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'pg';

import { EventsController } from './events.controller.js';
import { IncidentEventsListener, LISTEN_CLIENT_FACTORY } from './incident-events.listener.js';

import type { ListenClientFactory } from './incident-events.listener.js';
import type { Env } from '../config/env.schema.js';

@Module({
  controllers: [EventsController],
  providers: [
    {
      provide: LISTEN_CLIENT_FACTORY,
      inject: [ConfigService],
      useFactory:
        (config: ConfigService<Env, true>): ListenClientFactory =>
        () =>
          new Client({
            connectionString: config.get('DATABASE_URL', { infer: true }),
            connectionTimeoutMillis: 5000,
          }),
    },
    IncidentEventsListener,
  ],
})
export class EventsModule {}
