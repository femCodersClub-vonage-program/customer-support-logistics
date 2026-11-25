import { Controller, Inject, ServiceUnavailableException, Sse } from '@nestjs/common';

import { Roles } from '../auth/auth.decorators.js';

import { IncidentEventsListener } from './incident-events.listener.js';
import { toSseMessages } from './sse-messages.js';

import type { MessageEvent } from '@nestjs/common';
import type { Observable } from 'rxjs';

@Controller('events')
export class EventsController {
  constructor(@Inject(IncidentEventsListener) private readonly listener: IncidentEventsListener) {}

  @Sse('stream')
  @Roles('agent')
  stream(): Observable<MessageEvent> {
    if (!this.listener.listening) {
      throw new ServiceUnavailableException('Live updates are not available right now');
    }

    return toSseMessages(this.listener.stream());
  }
}
