import { describe, expect, it } from 'vitest';

import { parseInboxQuery } from './inbox-query';

import type { SearchParams } from './inbox-query';

const AGENT_ID = '5eed0000-0000-4000-8000-0000000000a1';
const ACTIVE = ['open', 'notified', 'in_mediation', 'escalated'];

function parse(params: SearchParams) {
  return parseInboxQuery(params, AGENT_ID);
}

describe('parseInboxQuery', () => {
  it('defaults to active incidents, oldest first', () => {
    const { query } = parse({});

    expect(query.status).toEqual(ACTIVE);
    expect(query.order).toBe('asc');
  });

  it('reads a single status as an array', () => {
    expect(parse({ status: 'resolved' }).query.status).toEqual(['resolved']);
  });

  it('means any status when the status param is empty', () => {
    expect(parse({ status: '' }).query.status).toBeUndefined();
  });

  it('ignores the empty status that comes with the selected ones', () => {
    expect(parse({ status: ['', 'open', 'resolved'] }).query.status).toEqual(['open', 'resolved']);
  });

  it('ignores empty form fields', () => {
    const { query } = parse({ type: '', q: '', agentId: '' });

    expect(query.type).toBeUndefined();
    expect(query.q).toBeUndefined();
    expect(query.agentId).toBeUndefined();
  });

  it('replaces "me" with the current agent id', () => {
    expect(parse({ agentId: 'me' }).query.agentId).toBe(AGENT_ID);
  });

  it('keeps "unassigned" as it is', () => {
    expect(parse({ agentId: 'unassigned' }).query.agentId).toBe('unassigned');
  });

  it('turns dates into days in the app time zone (winter)', () => {
    const { query } = parse({ createdFrom: '2026-11-10', createdTo: '2026-11-10' });

    expect(query.createdFrom).toBe('2026-11-09T23:00:00.000Z');
    expect(query.createdTo).toBe('2026-11-10T22:59:59.999Z');
  });

  it('turns dates into days in the app time zone (summer)', () => {
    const { query } = parse({ createdFrom: '2026-07-01', createdTo: '2026-07-01' });

    expect(query.createdFrom).toBe('2026-06-30T22:00:00.000Z');
    expect(query.createdTo).toBe('2026-07-01T21:59:59.999Z');
  });

  it('returns the params as they came when they are all valid', () => {
    expect(parse({ q: 'ana' }).params).toEqual({ q: 'ana' });
  });

  describe('with invalid params', () => {
    it('drops an unknown type and keeps the default status', () => {
      const { query, params } = parse({ type: 'bogus' });

      expect(query.type).toBeUndefined();
      expect(query.status).toEqual(ACTIVE);
      expect(params).toEqual({});
    });

    it('drops an unknown status and goes back to the default', () => {
      const { query, params } = parse({ status: 'bogus' });

      expect(query.status).toEqual(ACTIVE);
      expect(params).not.toHaveProperty('status');
    });

    it('drops only "to" when the range is reversed, and keeps the other filters', () => {
      const { query, params } = parse({
        type: 'damaged',
        createdFrom: '2026-11-10',
        createdTo: '2026-11-09',
      });

      expect(query.type).toBe('damaged');
      expect(query.createdFrom).toBe('2026-11-09T23:00:00.000Z');
      expect(query.createdTo).toBeUndefined();
      expect(params).toEqual({ type: 'damaged', createdFrom: '2026-11-10' });
    });

    it('drops only the search when it is too long', () => {
      const { query, params } = parse({ q: 'a'.repeat(101), type: 'damaged' });

      expect(query.q).toBeUndefined();
      expect(query.type).toBe('damaged');
      expect(params).toEqual({ type: 'damaged' });
    });

    it('drops a date that does not exist', () => {
      const { query, params } = parse({ createdFrom: '2026-13-45' });

      expect(query.createdFrom).toBeUndefined();
      expect(params).toEqual({});
    });
  });
});
