import { describe, expect, it } from 'vitest';

import { pageHref, parseInboxQuery } from './inbox-query';

const AGENT_ID = '5eed0000-0000-4000-8000-0000000000a1';

describe('parseInboxQuery', () => {
  it('defaults to active incidents, oldest first', () => {
    const query = parseInboxQuery({}, AGENT_ID);

    expect(query.status).toEqual(['open', 'notified', 'in_mediation', 'escalated']);
    expect(query.sort).toBe('createdAt');
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
    expect(query.order).toBe('asc');
  });

  it('splits the sort option into field and order', () => {
    const query = parseInboxQuery({ sort: 'updatedAt:desc' }, AGENT_ID);

    expect(query.sort).toBe('updatedAt');
    expect(query.order).toBe('desc');
  });

  it('ignores an unknown sort option', () => {
    const query = parseInboxQuery({ sort: 'bogus' }, AGENT_ID);

    expect(query.sort).toBe('createdAt');
    expect(query.order).toBe('asc');
  });

  it('converts the page into an offset', () => {
    const query = parseInboxQuery({ page: '3' }, AGENT_ID);

    expect(query.limit).toBe(20);
    expect(query.offset).toBe(40);
  });

  it.each(['abc', '0', '-2'])('treats page "%s" as the first page', (page) => {
    expect(parseInboxQuery({ page }, AGENT_ID).offset).toBe(0);
  });
});

describe('pageHref', () => {
  it('omits the page parameter for the first page', () => {
    expect(pageHref({ q: 'lucia' }, 1)).toBe('/inbox?q=lucia');
    expect(pageHref({}, 1)).toBe('/inbox');
  });

  it('keeps repeated params and replaces the current page', () => {
    expect(pageHref({ status: ['open', 'escalated'], page: '2' }, 3)).toBe(
      '/inbox?status=open&status=escalated&page=3',
    );
  });
});
