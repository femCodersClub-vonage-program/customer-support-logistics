import type { MemberEventKind, MemberSnapshot } from './call-client';

export type ParticipantRole = 'agent' | 'customer' | 'driver';

export type ParticipantState = 'invited' | 'ringing' | 'connected' | 'left';

export type ParticipantChannel = 'browser' | 'phone';

export interface Participant {
  state: ParticipantState;
  channel: ParticipantChannel;
  // A snapshot of the members never overwrites what a live event already said.
  source: 'initial' | 'snapshot' | 'event';
}

export interface Announcement {
  role: Exclude<ParticipantRole, 'agent'>;
  kind: 'joined' | 'left';
  // Changes on every announcement, so the same text is read again if it happens twice.
  id: number;
}

export interface ParticipantsState {
  participants: Record<ParticipantRole, Participant>;
  announcement: Announcement | null;
}

export type ParticipantsAction =
  | { type: 'event'; kind: MemberEventKind; userName: string; ownUserName: string }
  | { type: 'snapshot'; members: MemberSnapshot[]; ownUserName: string }
  | { type: 'agentLeft' }
  | { type: 'reset' };

export const PARTICIPANT_ROLES: readonly ParticipantRole[] = ['agent', 'customer', 'driver'];

// The channel follows from the role: the agent and the customer join from the browser, the
// driver from a phone. It is not read from the member, whose channel carries the phone number.
const CHANNEL_BY_ROLE: Record<ParticipantRole, ParticipantChannel> = {
  agent: 'browser',
  customer: 'browser',
  driver: 'phone',
};

export const initialParticipantsState: ParticipantsState = {
  participants: {
    agent: { state: 'invited', channel: CHANNEL_BY_ROLE.agent, source: 'initial' },
    customer: { state: 'invited', channel: CHANNEL_BY_ROLE.customer, source: 'initial' },
    driver: { state: 'invited', channel: CHANNEL_BY_ROLE.driver, source: 'initial' },
  },
  announcement: null,
};

const CUSTOMER_PREFIX = 'cust-';
const AGENT_PREFIX = 'agent-';

export function roleOfUser(userName: string, ownUserName: string): ParticipantRole | null {
  if (userName === ownUserName) {
    return 'agent';
  }

  if (userName.startsWith(CUSTOMER_PREFIX)) {
    return 'customer';
  }

  // Another agent, who is not one of the three participants of this panel.
  if (userName.startsWith(AGENT_PREFIX)) {
    return null;
  }

  // The driver has no Vonage user of ours: they come in by phone.
  return 'driver';
}

function stateOf(
  role: ParticipantRole,
  kind: MemberEventKind | MemberSnapshot['state'],
): ParticipantState {
  switch (kind) {
    case 'member:joined':
    case 'JOINED':
      return 'connected';
    case 'member:left':
    case 'LEFT':
      return 'left';
    case 'member:invited':
    case 'INVITED':
      // For a phone, being invited means that it is ringing.
      return role === 'driver' ? 'ringing' : 'invited';
  }
}

function withState(
  state: ParticipantsState,
  role: ParticipantRole,
  next: ParticipantState,
  source: Participant['source'],
): ParticipantsState {
  const current = state.participants[role];
  const changed = current.state !== next;
  const announced = source === 'event' && changed && role !== 'agent';
  const announcement: Announcement | null =
    announced && (next === 'connected' || next === 'left')
      ? {
          role,
          kind: next === 'connected' ? 'joined' : 'left',
          id: (state.announcement?.id ?? 0) + 1,
        }
      : state.announcement;

  return {
    participants: { ...state.participants, [role]: { ...current, state: next, source } },
    announcement,
  };
}

export function participantsReducer(
  state: ParticipantsState,
  action: ParticipantsAction,
): ParticipantsState {
  switch (action.type) {
    case 'event': {
      const role = roleOfUser(action.userName, action.ownUserName);

      return role === null ? state : withState(state, role, stateOf(role, action.kind), 'event');
    }
    case 'snapshot':
      return action.members.reduce((next, { userName, state: memberState }) => {
        const role = roleOfUser(userName, action.ownUserName);

        return role === null || next.participants[role].source === 'event'
          ? next
          : withState(next, role, stateOf(role, memberState), 'snapshot');
      }, state);
    case 'agentLeft':
      return withState(state, 'agent', 'left', 'event');
    case 'reset':
      return initialParticipantsState;
  }
}
