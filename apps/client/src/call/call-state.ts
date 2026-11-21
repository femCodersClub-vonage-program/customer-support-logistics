import type { LegStatus } from '@vonage/client-sdk';

export type CallStatus =
  'idle' | 'connecting' | 'ringing' | 'connected' | 'reconnecting' | 'ended' | 'failed';

export type CallFailure =
  | 'microphone_denied'
  | 'microphone_unavailable'
  | 'not_available'
  | 'no_connection'
  | 'session_expired'
  | 'unknown';

export type CallEndedBy = 'local' | 'remote';

export interface CallState {
  status: CallStatus;
  callId: string | null;
  muted: boolean;
  connectedAt: number | null;
  failure: CallFailure | null;
  endedBy: CallEndedBy | null;
}

export type CallAction =
  | { type: 'join' }
  | { type: 'placed'; callId: string }
  | { type: 'leg'; status: LegStatus; at: number }
  | { type: 'reconnecting' }
  | { type: 'reconnected' }
  | { type: 'muted'; muted: boolean }
  | { type: 'hangup'; by: CallEndedBy }
  | { type: 'failed'; failure: CallFailure };

export const initialCallState: CallState = {
  status: 'idle',
  callId: null,
  muted: false,
  connectedAt: null,
  failure: null,
  endedBy: null,
};

const ACTIVE_STATUSES: readonly CallStatus[] = [
  'connecting',
  'ringing',
  'connected',
  'reconnecting',
];

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

function onLeg(state: CallState, status: LegStatus, at: number): CallState {
  if (status === 'ANSWERED') {
    return { ...state, status: 'connected', connectedAt: state.connectedAt ?? at };
  }

  if (ENDED_LEG_STATUSES.includes(status)) {
    return { ...state, status: 'ended', endedBy: 'remote' };
  }

  return state.status === 'connecting' ? { ...state, status: 'ringing' } : state;
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
      return {
        ...state,
        callId: action.callId,
        status: state.status === 'connecting' ? 'ringing' : state.status,
      };
    case 'leg':
      return onLeg(state, action.status, action.at);
    case 'reconnecting':
      return state.status === 'connected' ? { ...state, status: 'reconnecting' } : state;
    case 'reconnected':
      return state.status === 'reconnecting' ? { ...state, status: 'connected' } : state;
    case 'muted':
      return { ...state, muted: action.muted };
    case 'hangup':
      return { ...state, status: 'ended', endedBy: action.by };
    case 'failed':
      return { ...state, status: 'failed', failure: action.failure };
  }
}
