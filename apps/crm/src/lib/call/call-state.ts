import type { LegStatus } from '@vonage/client-sdk';

export type CallStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'ended' | 'failed';

export type CallFailure =
  | 'microphone_denied'
  | 'microphone_unavailable'
  | 'not_available'
  | 'no_connection'
  | 'session_expired'
  | 'unknown';

export interface CallState {
  status: CallStatus;
  callId: string | null;
  muted: boolean;
  connectedAt: number | null;
  failure: CallFailure | null;
}

export type CallAction =
  | { type: 'join' }
  | { type: 'placed'; callId: string }
  | { type: 'leg'; status: LegStatus; at: number }
  | { type: 'muted'; muted: boolean }
  | { type: 'reconnecting' }
  | { type: 'reconnected' }
  | { type: 'ended' }
  | { type: 'failed'; failure: CallFailure };

export const initialCallState: CallState = {
  status: 'idle',
  callId: null,
  muted: false,
  connectedAt: null,
  failure: null,
};

const ACTIVE_STATUSES: readonly CallStatus[] = ['connecting', 'connected', 'reconnecting'];

const ENDED_LEG_STATUSES: readonly LegStatus[] = [
  'COMPLETED',
  'FAILED',
  'BUSY',
  'TIMEOUT',
  'CANCELLED',
  'REJECTED',
];

export function isCallActive(status: CallStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

export function callReducer(state: CallState, action: CallAction): CallState {
  if (action.type === 'join') {
    return isCallActive(state.status) ? state : { ...initialCallState, status: 'connecting' };
  }

  if (!isCallActive(state.status)) {
    return state;
  }

  switch (action.type) {
    case 'placed':
      return { ...state, callId: action.callId };
    case 'leg':
      if (action.status === 'ANSWERED') {
        return { ...state, status: 'connected', connectedAt: state.connectedAt ?? action.at };
      }

      return ENDED_LEG_STATUSES.includes(action.status) ? { ...state, status: 'ended' } : state;
    case 'muted':
      return { ...state, muted: action.muted };
    case 'reconnecting':
      return state.status === 'connected' ? { ...state, status: 'reconnecting' } : state;
    case 'reconnected':
      return state.status === 'reconnecting' ? { ...state, status: 'connected' } : state;
    case 'ended':
      return { ...state, status: 'ended' };
    case 'failed':
      return { ...state, status: 'failed', failure: action.failure };
  }
}
