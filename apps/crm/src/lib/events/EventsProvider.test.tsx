import { act, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EventsProvider, STREAM_URL, useEvents } from './EventsProvider';

import type { StreamMessage } from './types';

class FakeEventSource {
  static readonly CLOSED = 2;
  static instances: FakeEventSource[] = [];

  readyState = 1;
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((message: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  close() {
    this.closed = true;
    this.readyState = FakeEventSource.CLOSED;
  }
}

function Probe({ onMessage }: Readonly<{ onMessage: (message: StreamMessage) => void }>) {
  const { state, subscribe } = useEvents();

  useEffect(() => subscribe(onMessage), [subscribe, onMessage]);

  return <p>{state}</p>;
}

const latest = () => FakeEventSource.instances.at(-1)!;

describe('EventsProvider', () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('opens one connection and reports it as connected', () => {
    render(
      <EventsProvider>
        <Probe onMessage={vi.fn()} />
      </EventsProvider>,
    );

    expect(FakeEventSource.instances).toHaveLength(1);
    expect(latest().url).toBe(STREAM_URL);
    expect(screen.getByText('connecting')).toBeTruthy();

    act(() => latest().onopen?.());

    expect(screen.getByText('connected')).toBeTruthy();
  });

  it('delivers valid events and ignores malformed ones', () => {
    const onMessage = vi.fn();

    render(
      <EventsProvider>
        <Probe onMessage={onMessage} />
      </EventsProvider>,
    );

    const event = { type: 'incident.created', incidentId: 'a', updatedAt: '2026-11-21T10:00:00Z' };

    act(() => {
      latest().onmessage?.({ data: JSON.stringify(event) });
      latest().onmessage?.({ data: 'not json' });
      latest().onmessage?.({ data: JSON.stringify({ type: 'other', incidentId: 'a' }) });
    });

    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenCalledWith({ kind: 'event', event });
  });

  it('retries after the browser gives up and tells listeners to refetch', () => {
    const onMessage = vi.fn();

    render(
      <EventsProvider>
        <Probe onMessage={onMessage} />
      </EventsProvider>,
    );

    act(() => latest().onopen?.());
    act(() => {
      latest().readyState = FakeEventSource.CLOSED;
      latest().onerror?.();
    });

    expect(screen.getByText('reconnecting')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(FakeEventSource.instances).toHaveLength(2);

    act(() => latest().onopen?.());

    expect(screen.getByText('connected')).toBeTruthy();
    expect(onMessage).toHaveBeenCalledWith({ kind: 'reconnected' });
  });

  it('closes the connection on unmount and does not retry', () => {
    const { unmount } = render(
      <EventsProvider>
        <Probe onMessage={vi.fn()} />
      </EventsProvider>,
    );

    const source = latest();

    unmount();

    expect(source.closed).toBe(true);

    act(() => {
      vi.advanceTimersByTime(20_000);
    });

    expect(FakeEventSource.instances).toHaveLength(1);
  });
});
