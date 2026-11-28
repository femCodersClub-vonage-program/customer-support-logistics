import { act } from '@testing-library/react';
import { vi } from 'vitest';

import type {
  CallClient,
  CallClientEvent,
  CallClientEvents,
  MemberSnapshot,
} from '../lib/call/call-client';

type Listener = (...args: unknown[]) => void;

export const CONVERSATION_ID = 'CON-1';

export function createFakeCallClient(members: MemberSnapshot[] = []) {
  const listeners = new Map<symbol, { event: CallClientEvent; callback: Listener }>();

  const client = {
    createSession: vi.fn<CallClient['createSession']>().mockResolvedValue('session-1'),
    refreshSession: vi.fn<CallClient['refreshSession']>().mockResolvedValue(undefined),
    deleteSession: vi.fn<CallClient['deleteSession']>().mockResolvedValue(undefined),
    serverCall: vi.fn<CallClient['serverCall']>().mockResolvedValue('call-1'),
    hangup: vi.fn<CallClient['hangup']>().mockResolvedValue(undefined),
    getConversationId: vi.fn<CallClient['getConversationId']>().mockResolvedValue(CONVERSATION_ID),
    getMembers: vi.fn<CallClient['getMembers']>().mockResolvedValue(members),
    on: vi.fn((event: CallClientEvent, callback: unknown) => {
      const listener = Symbol(event);
      listeners.set(listener, { event, callback: callback as Listener });
      return listener;
    }) as CallClient['on'],
    off: vi.fn((_event: CallClientEvent, listener: symbol) => listeners.delete(listener)),
  } satisfies CallClient;

  const emit = <E extends CallClientEvent>(event: E, ...args: Parameters<CallClientEvents[E]>) =>
    act(async () => {
      for (const listener of listeners.values()) {
        if (listener.event === event) {
          listener.callback(...args);
        }
      }
    });

  return { client, emit, listenerCount: () => listeners.size };
}
