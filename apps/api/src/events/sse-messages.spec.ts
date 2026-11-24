import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HEARTBEAT, toSseMessages } from './sse-messages.js';

import type { StreamedIncidentEvent } from './incident-events.listener.js';
import type { MessageEvent } from '@nestjs/common';

const streamed: StreamedIncidentEvent = {
  id: 'event-1',
  event: {
    type: 'incident.status_changed',
    incidentId: '00000000-0000-4000-8000-000000000001',
    status: 'escalated',
    updatedAt: '2026-11-24T10:00:00.000Z',
  },
};

describe('toSseMessages', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends each event with its id and the event as data', () => {
    const events = new Subject<StreamedIncidentEvent>();
    const messages: MessageEvent[] = [];

    toSseMessages(events, 1000).subscribe((message) => messages.push(message));
    events.next(streamed);

    expect(messages).toEqual([{ id: 'event-1', data: streamed.event }]);
  });

  it('sends a heartbeat comment on every interval', () => {
    const messages: MessageEvent[] = [];

    toSseMessages(new Subject<StreamedIncidentEvent>(), 1000).subscribe((message) =>
      messages.push(message),
    );
    vi.advanceTimersByTime(2500);

    expect(messages).toEqual([HEARTBEAT, HEARTBEAT]);
  });

  it('ends the stream and stops the heartbeat when the events end', () => {
    const events = new Subject<StreamedIncidentEvent>();
    const messages: MessageEvent[] = [];
    let completed = false;

    toSseMessages(events, 1000).subscribe({
      next: (message) => messages.push(message),
      complete: () => {
        completed = true;
      },
    });
    events.complete();
    vi.advanceTimersByTime(5000);

    expect(completed).toBe(true);
    expect(messages).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops the heartbeat and leaves the events when the client goes away', () => {
    const events = new Subject<StreamedIncidentEvent>();
    const subscription = toSseMessages(events, 1000).subscribe();

    subscription.unsubscribe();

    expect(events.observed).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});
