'use client';

import { ApiError } from '@csl/api-client';
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';

import { api } from '../api';

import { loadVonageClient } from './call-client';
import { callReducer, initialCallState, isCallActive } from './call-state';
import { requestMicrophone } from './microphone';
import { initialParticipantsState, participantsReducer } from './participants';

import type { CallClient, CallClientEvent, CallClientLoader, MemberEvent } from './call-client';
import type { CallFailure, CallState } from './call-state';
import type { MicrophoneAccess } from './microphone';
import type { ParticipantsState } from './participants';
import type { ClientTokenResponse } from '@csl/contracts';

export const TOKEN_REFRESH_MARGIN_MS = 60_000;

export const TOKEN_REFRESH_RETRY_MS = 15_000;

export interface UseMediationCallOptions {
  loadClient?: CallClientLoader;
  requestMic?: () => Promise<MicrophoneAccess>;
}

export interface MediationCall {
  call: CallState;
  participants: ParticipantsState;
  join: () => Promise<void>;
  leave: () => Promise<void>;
  toggleMute: () => Promise<void>;
}

interface Connection {
  client: CallClient;
  userName: string;
  listeners: [CallClientEvent, symbol][];
  refreshTimer: ReturnType<typeof setTimeout> | undefined;
  // `undefined` until the conversation is known. Events that arrive before are kept.
  conversationId: string | null | undefined;
  syncStarted: boolean;
  pendingEvents: MemberEvent[];
  closed: boolean;
}

function toFailure(error: unknown): CallFailure {
  if (error instanceof ApiError) {
    return error.status === 404 || error.status === 409 ? 'not_available' : 'unknown';
  }

  if (error instanceof TypeError || !navigator.onLine) {
    return 'no_connection';
  }

  return 'unknown';
}

function close(connection: Connection): void {
  if (connection.closed) {
    return;
  }

  connection.closed = true;
  clearTimeout(connection.refreshTimer);

  for (const [event, listener] of connection.listeners) {
    connection.client.off(event, listener);
  }

  connection.client.deleteSession().catch(() => undefined);
}

export function useMediationCall(
  incidentId: string,
  { loadClient = loadVonageClient, requestMic = requestMicrophone }: UseMediationCallOptions = {},
): MediationCall {
  const [call, dispatchCall] = useReducer(callReducer, initialCallState);
  const [participantsState, dispatchParticipants] = useReducer(
    participantsReducer,
    initialParticipantsState,
  );
  const connectionRef = useRef<Connection | null>(null);
  const callIdRef = useRef<string | null>(null);
  const statusRef = useRef(call.status);
  const mutedRef = useRef(call.muted);

  statusRef.current = call.status;
  mutedRef.current = call.muted;

  const scheduleRefresh = useCallback(
    (connection: Connection, expiresAt: string) => {
      const refresh = async () => {
        try {
          const next = await api.createClientToken(incidentId);

          if (!connection.closed) {
            await connection.client.refreshSession(next.token);
            scheduleRefresh(connection, next.expiresAt);
          }
        } catch {
          if (!connection.closed && Date.parse(expiresAt) - Date.now() > TOKEN_REFRESH_RETRY_MS) {
            connection.refreshTimer = setTimeout(refresh, TOKEN_REFRESH_RETRY_MS);
          }
        }
      };

      const delay = Math.max(0, Date.parse(expiresAt) - Date.now() - TOKEN_REFRESH_MARGIN_MS);

      connection.refreshTimer = setTimeout(refresh, delay);
    },
    [incidentId],
  );

  const applyMemberEvent = useCallback(({ kind, userName }: MemberEvent, ownUserName: string) => {
    dispatchParticipants({ type: 'event', kind, userName, ownUserName });
  }, []);

  // Once the agent is in the conversation, find which one it is, so that the events of any
  // other conversation are ignored, and read who is there already: whoever came in before the
  // agent did produced events that this browser never received.
  const syncConversation = useCallback(
    async (connection: Connection) => {
      if (connection.syncStarted) {
        return;
      }

      connection.syncStarted = true;

      try {
        const conversationId = await connection.client.getConversationId(incidentId);

        if (connection.closed) {
          return;
        }

        connection.conversationId = conversationId;

        for (const event of connection.pendingEvents) {
          if (event.conversationId === conversationId) {
            applyMemberEvent(event, connection.userName);
          }
        }

        connection.pendingEvents = [];

        const members = await connection.client.getMembers(conversationId);

        if (!connection.closed) {
          dispatchParticipants({ type: 'snapshot', members, ownUserName: connection.userName });
        }
      } catch {
        // The panel keeps working from the live events alone.
        connection.conversationId = null;

        for (const event of connection.pendingEvents) {
          applyMemberEvent(event, connection.userName);
        }

        connection.pendingEvents = [];
      }
    },
    [applyMemberEvent, incidentId],
  );

  const listen = useCallback(
    (connection: Connection) => {
      const { client } = connection;
      const isOurs = (id: string) => callIdRef.current === null || callIdRef.current === id;

      connection.listeners = [
        [
          'legStatusUpdate',
          client.on('legStatusUpdate', (id, _legId, status) => {
            if (!isOurs(id)) {
              return;
            }

            dispatchCall({ type: 'leg', status, at: Date.now() });

            if (status === 'ANSWERED') {
              void syncConversation(connection);
            }
          }),
        ],
        [
          'callHangup',
          client.on('callHangup', (id) => {
            if (isOurs(id)) {
              dispatchCall({ type: 'ended' });
            }
          }),
        ],
        [
          'callMediaReconnecting',
          client.on('callMediaReconnecting', (id) => {
            if (isOurs(id)) {
              dispatchCall({ type: 'reconnecting' });
            }
          }),
        ],
        [
          'callMediaReconnection',
          client.on('callMediaReconnection', (id) => {
            if (isOurs(id)) {
              dispatchCall({ type: 'reconnected' });
            }
          }),
        ],
        [
          'callMediaDisconnect',
          client.on('callMediaDisconnect', (id) => {
            if (isOurs(id)) {
              dispatchCall({ type: 'failed', failure: 'no_connection' });
            }
          }),
        ],
        ['reconnecting', client.on('reconnecting', () => dispatchCall({ type: 'reconnecting' }))],
        ['reconnection', client.on('reconnection', () => dispatchCall({ type: 'reconnected' }))],
        [
          'sessionError',
          client.on('sessionError', (reason) => {
            dispatchCall({
              type: 'failed',
              failure: reason === 'EXPIRED_TOKEN' ? 'session_expired' : 'no_connection',
            });
          }),
        ],
        [
          'memberEvent',
          client.on('memberEvent', (event) => {
            if (connection.conversationId === undefined) {
              connection.pendingEvents.push(event);

              // The agent is in the conversation as soon as their own member joins.
              if (event.kind === 'member:joined' && event.userName === connection.userName) {
                void syncConversation(connection);
              }
            } else if (
              connection.conversationId === null ||
              connection.conversationId === event.conversationId
            ) {
              applyMemberEvent(event, connection.userName);
            }
          }),
        ],
      ];
    },
    [applyMemberEvent, syncConversation],
  );

  const join = useCallback(async () => {
    if (isCallActive(statusRef.current)) {
      return;
    }

    dispatchCall({ type: 'join' });
    dispatchParticipants({ type: 'reset' });
    callIdRef.current = null;

    const microphone = await requestMic();

    if (microphone !== 'granted') {
      dispatchCall({
        type: 'failed',
        failure: microphone === 'denied' ? 'microphone_denied' : 'microphone_unavailable',
      });
      return;
    }

    let connection: Connection | null = null;

    try {
      const [token, client]: [ClientTokenResponse, CallClient] = await Promise.all([
        api.createClientToken(incidentId),
        loadClient(),
      ]);

      connection = {
        client,
        userName: token.userName,
        listeners: [],
        refreshTimer: undefined,
        conversationId: undefined,
        syncStarted: false,
        pendingEvents: [],
        closed: false,
      };
      connectionRef.current = connection;

      await client.createSession(token.token);
      listen(connection);
      scheduleRefresh(connection, token.expiresAt);

      const callId = await client.serverCall({ incidentId });

      callIdRef.current = callId;
      dispatchCall({ type: 'placed', callId });
    } catch (error) {
      dispatchCall({ type: 'failed', failure: toFailure(error) });

      if (connection !== null) {
        close(connection);
      }
    }
  }, [incidentId, listen, loadClient, requestMic, scheduleRefresh]);

  const leave = useCallback(async () => {
    const connection = connectionRef.current;
    const callId = callIdRef.current;

    if (connection !== null && callId !== null) {
      await connection.client.hangup(callId).catch(() => undefined);
    }

    dispatchCall({ type: 'ended' });
  }, []);

  const toggleMute = useCallback(async () => {
    const connection = connectionRef.current;
    const callId = callIdRef.current;

    if (connection === null || callId === null) {
      return;
    }

    const muted = !mutedRef.current;

    try {
      await (muted ? connection.client.mute(callId) : connection.client.unmute(callId));
      dispatchCall({ type: 'muted', muted });
    } catch {
      return;
    }
  }, []);

  useEffect(() => {
    if (!isCallActive(call.status) && connectionRef.current !== null) {
      close(connectionRef.current);
      connectionRef.current = null;
    }
  }, [call.status]);

  useEffect(
    () => () => {
      const connection = connectionRef.current;
      const callId = callIdRef.current;

      if (connection === null) {
        return;
      }

      if (callId !== null && isCallActive(statusRef.current)) {
        connection.client.hangup(callId).catch(() => undefined);
      }

      close(connection);
      connectionRef.current = null;
    },
    [],
  );

  // When the agent's own call is over, the panel says so, even if no event arrives for it.
  const participants = useMemo<ParticipantsState>(
    () =>
      call.status === 'ended'
        ? participantsReducer(participantsState, { type: 'agentLeft' })
        : participantsState,
    [call.status, participantsState],
  );

  return { call, participants, join, leave, toggleMute };
}
