import { act, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EventsProvider, STREAM_URL, useEvents } from './EventsProvider';

import type { StreamMessage } from './EventsProvider';

const { mockPush } = vi.hoisted(() => ({
  mockPush: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

class FakeEventSource {
  static readonly CLOSED = 2;
  static instances: FakeEventSource[] = [];

  readyState = 1;
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((message: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;

  named = new Map<string, () => void>();

  addEventListener(name: string, listener: () => void) {
    this.named.set(name, listener);
  }

  removeEventListener(name: string, listener: () => void) {
    if (this.named.get(name) === listener) {
      this.named.delete(name);
    }
  }

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

    const event = {
      type: 'incident.created',
      incidentId: '550e8400-e29b-41d4-a716-446655440000',
      updatedAt: '2026-11-21T10:00:00Z',
    };

    act(() => {
      latest().onmessage?.({ data: JSON.stringify(event) });
      latest().onmessage?.({ data: 'not json' });
      latest().onmessage?.({ data: JSON.stringify({ type: 'other', incidentId: 'a' }) });
    });

    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenCalledWith({ kind: 'event', event });
  });

  it('accepts communication updated events', () => {
    const onMessage = vi.fn();

    render(
      <EventsProvider>
        <Probe onMessage={onMessage} />
      </EventsProvider>,
    );

    const event = {
      type: 'incident.communication_updated',
      incidentId: '550e8400-e29b-41d4-a716-446655440000',
      updatedAt: '2026-11-21T10:00:00Z',
    };

    act(() => latest().onmessage?.({ data: JSON.stringify(event) }));

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

  it('does not ask to refetch when the first attempt fails before opening', () => {
    const onMessage = vi.fn();

    render(
      <EventsProvider>
        <Probe onMessage={onMessage} />
      </EventsProvider>,
    );

    act(() => {
      latest().readyState = FakeEventSource.CLOSED;
      latest().onerror?.();
    });

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    act(() => latest().onopen?.());

    expect(screen.getByText('connected')).toBeTruthy();
    expect(onMessage).not.toHaveBeenCalledWith({ kind: 'reconnected' });
  });

  it('stops retrying and redirects when the session is unauthorized', () => {
    mockPush.mockClear();

    vi.stubGlobal('location', {
      pathname: '/inbox',
      search: '?status=open',
    });

    render(
      <EventsProvider>
        <Probe onMessage={vi.fn()} />
      </EventsProvider>,
    );

    const source = latest();

    act(() => {
      source.named.get('unauthorized')?.();
    });

    act(() => {
      vi.advanceTimersByTime(20_000);
    });

    expect(source.closed).toBe(true);
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(mockPush).toHaveBeenCalledWith('/session-expired?next=%2Finbox%3Fstatus%3Dopen');
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
