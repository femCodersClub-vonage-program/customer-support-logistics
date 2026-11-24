import { Observable } from 'rxjs';

import type { StreamedIncidentEvent } from './incident-events.listener.js';
import type { MessageEvent } from '@nestjs/common';

export const HEARTBEAT_INTERVAL_MS = 25_000;

export const HEARTBEAT: MessageEvent = { comment: 'heartbeat' };

export function toSseMessages(
  events: Observable<StreamedIncidentEvent>,
  heartbeatIntervalMs = HEARTBEAT_INTERVAL_MS,
): Observable<MessageEvent> {
  return new Observable<MessageEvent>((subscriber) => {
    const heartbeat = setInterval(() => subscriber.next(HEARTBEAT), heartbeatIntervalMs);
    const subscription = events.subscribe({
      next: ({ id, event }) => subscriber.next({ id, data: event }),
      error: (error: unknown) => subscriber.error(error),
      complete: () => subscriber.complete(),
    });

    return () => {
      clearInterval(heartbeat);
      subscription.unsubscribe();
    };
  });
}
