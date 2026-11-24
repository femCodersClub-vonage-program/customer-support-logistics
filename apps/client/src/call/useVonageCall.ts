import { ApiError } from '@csl/api-client';
import { useCallback, useEffect, useReducer, useRef } from 'react';

import { api } from '../api.ts';

import { loadVonageClient } from './call-client.ts';
import { callReducer, initialCallState, isCallActive } from './call-state.ts';
import { requestMicrophone } from './microphone.ts';

import type { CallClient, CallClientEvent, CallClientLoader } from './call-client.ts';
import type { CallAction, CallFailure, CallState } from './call-state.ts';
import type { MicrophoneAccess } from './microphone.ts';
import type { ClientTokenResponse } from '@csl/contracts';
import type { Dispatch } from 'react';

export const TOKEN_REFRESH_MARGIN_MS = 60_000;

export const TOKEN_REFRESH_RETRY_MS = 15_000;

export interface UseVonageCallOptions {
  loadClient?: CallClientLoader;
  requestMic?: () => Promise<MicrophoneAccess>;
}

export interface VonageCall {
  state: CallState;
  join: () => Promise<void>;
  hangup: () => Promise<void>;
  toggleMute: () => Promise<void>;
}

interface Connection {
  client: CallClient;
  listeners: [CallClientEvent, symbol][];
  refreshTimer: ReturnType<typeof setTimeout> | undefined;
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

function listen(
  connection: Connection,
  dispatch: Dispatch<CallAction>,
  callId: () => string | null,
) {
  const { client } = connection;
  const isOurs = (id: string) => callId() === null || callId() === id;

  connection.listeners = [
    [
      'legStatusUpdate',
      client.on('legStatusUpdate', (id, _legId, status) => {
        if (isOurs(id)) {
          dispatch({ type: 'leg', status, at: Date.now() });
        }
      }),
    ],
    [
      'callHangup',
      client.on('callHangup', (id, _quality, reason) => {
        if (isOurs(id)) {
          dispatch({ type: 'hangup', by: reason === 'LOCAL_HANGUP' ? 'local' : 'remote' });
        }
      }),
    ],
    [
      'callMediaReconnecting',
      client.on('callMediaReconnecting', (id) => {
        if (isOurs(id)) {
          dispatch({ type: 'reconnecting' });
        }
      }),
    ],
    [
      'callMediaReconnection',
      client.on('callMediaReconnection', (id) => {
        if (isOurs(id)) {
          dispatch({ type: 'reconnected' });
        }
      }),
    ],
    [
      'callMediaDisconnect',
      client.on('callMediaDisconnect', (id) => {
        if (isOurs(id)) {
          dispatch({ type: 'failed', failure: 'no_connection' });
        }
      }),
    ],
    ['reconnecting', client.on('reconnecting', () => dispatch({ type: 'reconnecting' }))],
    ['reconnection', client.on('reconnection', () => dispatch({ type: 'reconnected' }))],
    [
      'sessionError',
      client.on('sessionError', (reason) => {
        dispatch({
          type: 'failed',
          failure: reason === 'EXPIRED_TOKEN' ? 'session_expired' : 'no_connection',
        });
      }),
    ],
  ];
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

export function useVonageCall(
  incidentId: string,
  { loadClient = loadVonageClient, requestMic = requestMicrophone }: UseVonageCallOptions = {},
): VonageCall {
  const [state, dispatch] = useReducer(callReducer, initialCallState);
  const connectionRef = useRef<Connection | null>(null);
  const callIdRef = useRef<string | null>(null);
  const statusRef = useRef(state.status);

  statusRef.current = state.status;

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

  const join = useCallback(async () => {
    if (isCallActive(statusRef.current)) {
      return;
    }

    dispatch({ type: 'join' });
    callIdRef.current = null;

    const microphone = await requestMic();

    if (microphone !== 'granted') {
      dispatch({
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

      connection = { client, listeners: [], refreshTimer: undefined, closed: false };
      connectionRef.current = connection;

      await client.createSession(token.token);
      listen(connection, dispatch, () => callIdRef.current);
      scheduleRefresh(connection, token.expiresAt);

      const callId = await client.serverCall({ incidentId });

      callIdRef.current = callId;
      dispatch({ type: 'placed', callId });
    } catch (error) {
      dispatch({ type: 'failed', failure: toFailure(error) });

      if (connection !== null) {
        close(connection);
      }
    }
  }, [incidentId, loadClient, requestMic, scheduleRefresh]);

  const hangup = useCallback(async () => {
    const connection = connectionRef.current;
    const callId = callIdRef.current;

    if (connection !== null && callId !== null) {
      await connection.client.hangup(callId).catch(() => undefined);
    }

    dispatch({ type: 'hangup', by: 'local' });
  }, []);

  const toggleMute = useCallback(async () => {
    const connection = connectionRef.current;
    const callId = callIdRef.current;

    if (connection === null || callId === null) {
      return;
    }

    const muted = !state.muted;

    try {
      await (muted ? connection.client.mute(callId) : connection.client.unmute(callId));
      dispatch({ type: 'muted', muted });
    } catch {
      return;
    }
  }, [state.muted]);

  useEffect(() => {
    if (!isCallActive(state.status) && connectionRef.current !== null) {
      close(connectionRef.current);
      connectionRef.current = null;
    }
  }, [state.status]);

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

  return { state, join, hangup, toggleMute };
}
