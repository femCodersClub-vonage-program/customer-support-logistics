import { describe, expect, it } from 'vitest';

import { initialParticipantsState, participantsReducer, roleOfUser } from './participants';

import type { ParticipantsAction, ParticipantsState } from './participants';

const OWN = 'agent-1';
const CUSTOMER = 'cust-9';
const DRIVER = 'PSTN-abc';

function run(...actions: ParticipantsAction[]): ParticipantsState {
  return actions.reduce(participantsReducer, initialParticipantsState);
}

const event = (kind: 'member:invited' | 'member:joined' | 'member:left', userName: string) =>
  ({ type: 'event', kind, userName, ownUserName: OWN }) as const;

describe('roleOfUser', () => {
  it('tells the agent, the customer and the driver apart', () => {
    expect(roleOfUser(OWN, OWN)).toBe('agent');
    expect(roleOfUser(CUSTOMER, OWN)).toBe('customer');
    expect(roleOfUser(DRIVER, OWN)).toBe('driver');
  });

  it('ignores another agent', () => {
    expect(roleOfUser('agent-2', OWN)).toBeNull();
  });
});

describe('participantsReducer', () => {
  it('starts with the three participants invited and their channels', () => {
    expect(initialParticipantsState.participants).toEqual({
      agent: { state: 'invited', channel: 'browser', source: 'initial' },
      customer: { state: 'invited', channel: 'browser', source: 'initial' },
      driver: { state: 'invited', channel: 'phone', source: 'initial' },
    });
  });

  it('shows the driver ringing when their phone is invited', () => {
    const state = run(event('member:invited', DRIVER));

    expect(state.participants.driver.state).toBe('ringing');
  });

  it('shows the customer invited, connected and left', () => {
    expect(run(event('member:invited', CUSTOMER)).participants.customer.state).toBe('invited');
    expect(run(event('member:joined', CUSTOMER)).participants.customer.state).toBe('connected');
    expect(
      run(event('member:joined', CUSTOMER), event('member:left', CUSTOMER)).participants.customer
        .state,
    ).toBe('left');
  });

  it('announces who joins and who leaves, but not the agent', () => {
    expect(run(event('member:joined', DRIVER)).announcement).toEqual({
      role: 'driver',
      kind: 'joined',
      id: 1,
    });
    expect(run(event('member:joined', DRIVER), event('member:left', DRIVER)).announcement).toEqual({
      role: 'driver',
      kind: 'left',
      id: 2,
    });
    expect(run(event('member:joined', OWN)).announcement).toBeNull();
  });

  it('does not announce a state that did not change', () => {
    const state = run(event('member:joined', CUSTOMER), event('member:joined', CUSTOMER));

    expect(state.announcement?.id).toBe(1);
  });

  it('does not announce an invitation', () => {
    expect(run(event('member:invited', DRIVER)).announcement).toBeNull();
  });

  it('fills in who was there before from a snapshot, without announcing them', () => {
    const state = run({
      type: 'snapshot',
      ownUserName: OWN,
      members: [
        { userName: CUSTOMER, state: 'JOINED' },
        { userName: DRIVER, state: 'INVITED' },
        { userName: 'agent-2', state: 'JOINED' },
      ],
    });

    expect(state.participants.customer.state).toBe('connected');
    expect(state.participants.driver.state).toBe('ringing');
    expect(state.participants.agent.state).toBe('invited');
    expect(state.announcement).toBeNull();
  });

  it('keeps what a live event said when a late snapshot disagrees', () => {
    const state = run(event('member:left', CUSTOMER), {
      type: 'snapshot',
      ownUserName: OWN,
      members: [{ userName: CUSTOMER, state: 'JOINED' }],
    });

    expect(state.participants.customer.state).toBe('left');
  });

  it('marks the agent as left and can start over', () => {
    const left = run(event('member:joined', OWN), { type: 'agentLeft' });

    expect(left.participants.agent.state).toBe('left');
    expect(participantsReducer(left, { type: 'reset' })).toBe(initialParticipantsState);
  });
});
