import type { HangupReason, LegStatus, SessionErrorReason } from '@vonage/client-sdk';

export type MemberEventKind = 'member:invited' | 'member:joined' | 'member:left';

export type MemberSnapshotState = 'INVITED' | 'JOINED' | 'LEFT';

export interface MemberEvent {
  kind: MemberEventKind;
  conversationId: string;
  userName: string;
}

export interface MemberSnapshot {
  userName: string;
  state: MemberSnapshotState;
}

export interface CallClientEvents {
  legStatusUpdate: (callId: string, legId: string, status: LegStatus) => void;
  callHangup: (callId: string, quality: unknown, reason: HangupReason) => void;
  callMediaReconnecting: (callId: string) => void;
  callMediaReconnection: (callId: string) => void;
  callMediaDisconnect: (callId: string, reason: string) => void;
  reconnecting: () => void;
  reconnection: () => void;
  sessionError: (reason: SessionErrorReason) => void;
  memberEvent: (event: MemberEvent) => void;
}

export type CallClientEvent = keyof CallClientEvents;

export interface CallClient {
  createSession(token: string): Promise<unknown>;
  refreshSession(token: string): Promise<unknown>;
  deleteSession(): Promise<unknown>;
  serverCall(context: { incidentId: string }): Promise<string>;
  hangup(callId: string): Promise<unknown>;
  getConversationId(incidentId: string): Promise<string>;
  getMembers(conversationId: string): Promise<MemberSnapshot[]>;
  on<E extends CallClientEvent>(event: E, callback: CallClientEvents[E]): symbol;
  off(event: CallClientEvent, listener: symbol): unknown;
}

export type CallClientLoader = () => Promise<CallClient>;

const MEMBER_EVENT_KINDS: readonly string[] = ['member:invited', 'member:joined', 'member:left'];

const MEMBER_SNAPSHOT_STATES: readonly string[] = ['INVITED', 'JOINED', 'LEFT'];

export function conversationName(incidentId: string): string {
  return `inc-${incidentId}`;
}

// The SDK is only imported here, with a dynamic import(), so its code stays in a chunk that
// only the mediation page loads. Everything else works with the small CallClient interface,
// which is also what the tests replace.
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
    getConversationId: async (incidentId) =>
      (await client.getConversation(conversationName(incidentId))).id,
    getMembers: async (conversationId) => {
      const page = await client.getConversationMembers(conversationId, { pageSize: 100 });

      // Only the user name and the state are read: a member also carries the phone number of
      // the driver, which must never reach the screen.
      return page.members.flatMap(({ user, state }) =>
        user !== null && user !== undefined && MEMBER_SNAPSHOT_STATES.includes(state)
          ? [{ userName: user.name, state: state as MemberSnapshotState }]
          : [],
      );
    },
    on: (event, callback) => {
      if (event !== 'memberEvent') {
        return on(event, callback);
      }

      const forward = callback as CallClientEvents['memberEvent'];

      return on('conversationEvent', (conversationEvent: unknown) => {
        const { kind, conversationId, body } = conversationEvent as {
          kind: string;
          conversationId: string;
          body?: { user?: { name?: string } };
        };
        const userName = body?.user?.name;

        if (MEMBER_EVENT_KINDS.includes(kind) && userName !== undefined) {
          forward({ kind: kind as MemberEventKind, conversationId, userName });
        }
      });
    },
    off: (event, listener) => off(event === 'memberEvent' ? 'conversationEvent' : event, listener),
  };
};
