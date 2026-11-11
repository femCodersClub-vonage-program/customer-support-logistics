import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { CURRENT_AGENT_ID } from '../../lib/api.server';
import { renderWithIntl } from '../../test/render';

import InboxPage from './page';

import type { SearchParams } from '../../lib/inbox-query';
import type { IncidentListItem } from '@csl/contracts';

vi.mock('next-intl/server', async () => {
  const { getMessages } = await import('../../i18n/messages');

  return { getTranslations: () => Promise.resolve(() => getMessages('en').inbox.title) };
});

const incident: IncidentListItem = {
  id: 'a1b2c3d4-0000-4000-8000-000000000001',
  orderId: 'b2c3d4e5-0000-4000-8000-000000000002',
  type: 'damaged',
  status: 'open',
  agentId: null,
  resolution: null,
  createdAt: '2026-11-02T10:00:00.000Z',
  updatedAt: '2026-11-02T10:30:00.000Z',
  closedAt: null,
  customer: { id: 'c3d4e5f6-0000-4000-8000-000000000003', name: 'Lucía Martín' },
};

const server = setupServer();
const requests: Request[] = [];

function respondWith(items: IncidentListItem[], total = items.length) {
  server.use(
    http.get('*/incidents', ({ request }) => {
      requests.push(request);

      return HttpResponse.json({ items, total, limit: 20, offset: 0 });
    }),
  );
}

async function renderInbox(params: SearchParams = {}) {
  renderWithIntl(await InboxPage({ searchParams: Promise.resolve(params) }));

  return new URL((requests[0] as Request).url);
}

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server.resetHandlers();
  requests.length = 0;
});

afterAll(() => {
  server.close();
});

describe('InboxPage', () => {
  it('asks for the active incidents, oldest first, and shows them', async () => {
    respondWith([incident]);

    const url = await renderInbox();

    expect(url.searchParams.getAll('status')).toEqual([
      'open',
      'notified',
      'in_mediation',
      'escalated',
    ]);
    expect(url.searchParams.get('sort')).toBe('createdAt');
    expect(url.searchParams.get('order')).toBe('asc');
    expect(screen.getByText('Lucía Martín')).toBeInTheDocument();
  });

  it('identifies the current agent in the request', async () => {
    respondWith([incident]);

    await renderInbox();

    expect((requests[0] as Request).headers.get('x-dev-actor')).toBe(`agent:${CURRENT_AGENT_ID}`);
  });

  describe('filters', () => {
    const cases: [string, SearchParams, Record<string, string[]>][] = [
      ['the type', { type: 'damaged' }, { type: ['damaged'] }],
      ['unassigned', { agentId: 'unassigned' }, { agentId: ['unassigned'] }],
      ['assigned to me', { agentId: 'me' }, { agentId: [CURRENT_AGENT_ID] }],
      ['the search', { q: 'ana' }, { q: ['ana'] }],
      [
        'several statuses',
        { status: ['', 'resolved', 'escalated'] },
        { status: ['resolved', 'escalated'] },
      ],
      ['any status', { status: '' }, { status: [] }],
      [
        'the date range as days in Madrid time',
        { createdFrom: '2026-11-10', createdTo: '2026-11-11' },
        { createdFrom: ['2026-11-09T23:00:00.000Z'], createdTo: ['2026-11-11T22:59:59.999Z'] },
      ],
      ['the sort', { sort: 'updatedAt:desc' }, { sort: ['updatedAt'], order: ['desc'] }],
      ['the page as an offset', { page: '3' }, { limit: ['20'], offset: ['40'] }],
    ];

    it.each(cases)('sends %s to the API', async (_name, params, expected) => {
      respondWith([incident]);

      const url = await renderInbox(params);

      for (const [key, values] of Object.entries(expected)) {
        expect(url.searchParams.getAll(key)).toEqual(values);
      }
    });

    it('works with every filter combined and fills the form with them', async () => {
      respondWith([incident]);

      const url = await renderInbox({
        status: ['', 'resolved'],
        type: 'damaged',
        agentId: 'unassigned',
        q: 'ana',
        createdFrom: '2026-11-10',
        sort: 'updatedAt:desc',
      });

      expect(url.searchParams.getAll('status')).toEqual(['resolved']);
      expect(url.searchParams.get('type')).toBe('damaged');
      expect(url.searchParams.get('agentId')).toBe('unassigned');
      expect(url.searchParams.get('q')).toBe('ana');
      expect(url.searchParams.get('createdFrom')).toBe('2026-11-09T23:00:00.000Z');
      expect(url.searchParams.get('sort')).toBe('updatedAt');
      expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue('ana');
      expect(screen.getByRole('combobox', { name: 'Type' })).toHaveValue('damaged');
      expect(screen.getByRole('combobox', { name: 'Assigned to' })).toHaveValue('unassigned');
    });

    it('does not send an invalid filter and does not show it in the form', async () => {
      respondWith([incident]);

      const url = await renderInbox({
        type: 'damaged',
        createdFrom: '2026-11-10',
        createdTo: '2026-11-09',
      });

      expect(url.searchParams.has('createdTo')).toBe(false);
      expect(url.searchParams.get('type')).toBe('damaged');
      expect(screen.getByLabelText('Created to')).toHaveValue('');
      expect(screen.getByLabelText('Created from')).toHaveValue('2026-11-10');
    });
  });

  it('shows the empty state and no pagination when there are no incidents', async () => {
    respondWith([]);

    await renderInbox({ q: 'nobody' });

    expect(screen.getByText('No incidents to show.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Pagination' })).not.toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue('nobody');
  });

  it('shows the pagination when there are several pages', async () => {
    respondWith([incident], 45);

    await renderInbox();

    expect(screen.getByText('Page 1 of 3 · 45 incidents')).toBeInTheDocument();
  });

  it('throws when the API fails, so that the error state is shown', async () => {
    server.use(
      http.get('*/incidents', () =>
        HttpResponse.json(
          { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
          { status: 500 },
        ),
      ),
    );

    await expect(InboxPage({ searchParams: Promise.resolve({}) })).rejects.toMatchObject({
      status: 500,
    });
  });
});
