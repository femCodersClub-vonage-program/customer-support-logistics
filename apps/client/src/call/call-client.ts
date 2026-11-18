import type { HangupReason, LegStatus, SessionErrorReason } from '@vonage/client-sdk';

export interface CallClientEvents {
  legStatusUpdate: (callId: string, legId: string, status: LegStatus) => void;
  callHangup: (callId: string, quality: unknown, reason: HangupReason) => void;
  callMediaReconnecting: (callId: string) => void;
  callMediaReconnection: (callId: string) => void;
  callMediaDisconnect: (callId: string, reason: string) => void;
  reconnecting: () => void;
  reconnection: () => void;
  sessionError: (reason: SessionErrorReason) => void;
}

export type CallClientEvent = keyof CallClientEvents;

export interface CallClient {
  createSession(token: string): Promise<unknown>;
  refreshSession(token: string): Promise<unknown>;
  deleteSession(): Promise<unknown>;
  serverCall(context: { incidentId: string }): Promise<string>;
  hangup(callId: string): Promise<unknown>;
  mute(callId: string): Promise<unknown>;
  unmute(callId: string): Promise<unknown>;
  on<E extends CallClientEvent>(event: E, callback: CallClientEvents[E]): symbol;
  off(event: CallClientEvent, listener: symbol): unknown;
}

export type CallClientLoader = () => Promise<CallClient>;

export const loadVonageClient: CallClientLoader = async () => {
  const { VonageClient } = await import('@vonage/client-sdk');
  const client = new VonageClient();
  const on = client.on.bind(client) as (event: string, callback: unknown) => symbol;
  const off = client.off.bind(client) as (event: string, listener: symbol) => boolean;

  return {
    createSession: (token) => client.createSession(token),
    refreshSession: (token) => client.refreshSession(token),
    deleteSession: () => client.deleteSession(),
    serverCall: (context) => client.serverCall(context),
    hangup: (callId) => client.hangup(callId),
    mute: (callId) => client.mute(callId),
    unmute: (callId) => client.unmute(callId),
    on: (event, callback) => on(event, callback),
    off: (event, listener) => off(event, listener),
  };
};
