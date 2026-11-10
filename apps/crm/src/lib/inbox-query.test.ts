import { describe, expect, it } from 'vitest';

import { parseInboxQuery } from './inbox-query';

const AGENT_ID = '5eed0000-0000-4000-8000-0000000000a1';

describe('parseInboxQuery', () => {
  it('defaults to active incidents, oldest first', () => {
    const query = parseInboxQuery({}, AGENT_ID);

    expect(query.status).toEqual(['open', 'notified', 'in_mediation', 'escalated']);
    expect(query.order).toBe('asc');
  });

  it('reads a single status as an array', () => {
    expect(parseInboxQuery({ status: 'resolved' }, AGENT_ID).status).toEqual(['resolved']);
  });

  it('ignores empty form fields', () => {
    const query = parseInboxQuery({ type: '', q: '', agentId: '' }, AGENT_ID);

    expect(query.type).toBeUndefined();
    expect(query.q).toBeUndefined();
    expect(query.agentId).toBeUndefined();
  });

  it('replaces "me" with the current agent id', () => {
    expect(parseInboxQuery({ agentId: 'me' }, AGENT_ID).agentId).toBe(AGENT_ID);
  });

  it('keeps "unassigned" as it is', () => {
    expect(parseInboxQuery({ agentId: 'unassigned' }, AGENT_ID).agentId).toBe('unassigned');
  });

  it('turns dates into the start and the end of the day', () => {
    const query = parseInboxQuery({ createdFrom: '2026-11-02', createdTo: '2026-11-03' }, AGENT_ID);

    expect(query.createdFrom).toBe('2026-11-02T00:00:00.000Z');
    expect(query.createdTo).toBe('2026-11-03T23:59:59.999Z');
  });

  it('falls back to the defaults when the URL is invalid', () => {
    const query = parseInboxQuery({ type: 'bogus' }, AGENT_ID);

    expect(query.type).toBeUndefined();
    expect(query.status).toEqual(['open', 'notified', 'in_mediation', 'escalated']);
  });
});