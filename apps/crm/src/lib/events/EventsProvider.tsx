'use client';

import { useRouter } from 'next/navigation';
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { INCIDENT_EVENT_TYPES } from './types';
import { SESSION_EXPIRED_PATH } from '../session';

import type { ConnectionState, IncidentStreamEvent, StreamMessage } from './types';
import type { ReactNode } from 'react';

export const STREAM_URL = '/api/events/stream';
const RETRY_DELAYS_MS = [1000, 2000, 5000, 10000] as const;

type Listener = (message: StreamMessage) => void;

interface EventsContextValue {
  state: ConnectionState;
  subscribe: (listener: Listener) => () => void;
}

const EventsContext = createContext<EventsContextValue | null>(null);

const KNOWN_TYPES = new Set<string>(Object.values(INCIDENT_EVENT_TYPES));

function parseEvent(data: string): IncidentStreamEvent | null {
  try {
    const value: unknown = JSON.parse(data);

    if (
      typeof value === 'object' &&
      value !== null &&
      'type' in value &&
      typeof value.type === 'string' &&
      KNOWN_TYPES.has(value.type) &&
      'incidentId' in value &&
      typeof value.incidentId === 'string'
    ) {
      return value as IncidentStreamEvent;
    }
  } catch {
    // Ignore malformed messages: one bad event must not break the stream.
  }

  return null;
}

export function EventsProvider({ children }: Readonly<{ children: ReactNode }>) {
  const { push } = useRouter();
  const [state, setState] = useState<ConnectionState>('connecting');
  const listenersRef = useRef(new Set<Listener>());

  const subscribe = useCallback((listener: Listener) => {
    listenersRef.current.add(listener);

    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  useEffect(() => {
    let source: EventSource | null = null;
    let unauthorizedSource: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let closedByUs = false;
    let lostConnection = false;
    let hasConnected = false;
    let attempt = 0;

    const emit = (message: StreamMessage) => {
      listenersRef.current.forEach((listener) => listener(message));
    };

    function onUnauthorized() {
      closedByUs = true;
      clearTimeout(timer);
      source?.removeEventListener('unauthorized', onUnauthorized);
      source?.close();

      const next = `${window.location.pathname}${window.location.search}`;

      push(`${SESSION_EXPIRED_PATH}?next=${encodeURIComponent(next)}`);
    }

    const connect = () => {
      const current = new EventSource(STREAM_URL);

      source = current;

      current.onopen = () => {
        hasConnected = true;
        attempt = 0;
        setState('connected');

        if (lostConnection) {
          lostConnection = false;
          emit({ kind: 'reconnected' });
        }
      };

      current.onmessage = (message: MessageEvent<string>) => {
        const event = parseEvent(message.data);

        if (event) {
          emit({ kind: 'event', event });
        }
      };

      unauthorizedSource = current;
      unauthorizedSource.addEventListener('unauthorized', onUnauthorized);

      current.onerror = () => {
        if (closedByUs) {
          return;
        }

        lostConnection = hasConnected;
        setState('reconnecting');

        if (current.readyState === EventSource.CLOSED) {
          current.removeEventListener('unauthorized', onUnauthorized);
          current.close();
          const delay = RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];

          attempt += 1;
          timer = setTimeout(connect, delay);
        }
      };
    };

    connect();

    return () => {
      closedByUs = true;
      unauthorizedSource?.removeEventListener('unauthorized', onUnauthorized);
      clearTimeout(timer);
      source?.close();
    };
  }, [push]);

  const value = useMemo(() => ({ state, subscribe }), [state, subscribe]);

  return <EventsContext value={value}>{children}</EventsContext>;
}

export function useEvents(): EventsContextValue {
  const context = use(EventsContext);

  if (!context) {
    throw new Error('useEvents must be used inside EventsProvider');
  }

  return context;
}
