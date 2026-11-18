import { act } from '@testing-library/react';
import { vi } from 'vitest';

import type { CallClient, CallClientEvent, CallClientEvents } from '../call/call-client.ts';

type Listener = (...args: unknown[]) => void;

export function createFakeCallClient() {
  const listeners = new Map<symbol, { event: CallClientEvent; callback: Listener }>();

  const client = {
    createSession: vi.fn<CallClient['createSession']>().mockResolvedValue('session-1'),
    refreshSession: vi.fn<CallClient['refreshSession']>().mockResolvedValue(undefined),
    deleteSession: vi.fn<CallClient['deleteSession']>().mockResolvedValue(undefined),
    serverCall: vi.fn<CallClient['serverCall']>().mockResolvedValue('call-1'),
    hangup: vi.fn<CallClient['hangup']>().mockResolvedValue(undefined),
    mute: vi.fn<CallClient['mute']>().mockResolvedValue(undefined),
    unmute: vi.fn<CallClient['unmute']>().mockResolvedValue(undefined),
    on: vi.fn((event: CallClientEvent, callback: unknown) => {
      const listener = Symbol(event);
      listeners.set(listener, { event, callback: callback as Listener });
      return listener;
    }) as CallClient['on'],
    off: vi.fn((_event: CallClientEvent, listener: symbol) => listeners.delete(listener)),
  } satisfies CallClient;

  const emit = <E extends CallClientEvent>(event: E, ...args: Parameters<CallClientEvents[E]>) =>
    act(() => {
      for (const listener of listeners.values()) {
        if (listener.event === event) {
          listener.callback(...args);
        }
      }
    });

  return { client, emit, listenerCount: () => listeners.size };
}
