import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { renderWithIntl } from '../../../test/render';
import { server } from '../../../test/server';

import IncidentPage from './page';

import type { IncidentDetail } from '@csl/contracts';

const { mockGetLocale, mockGetTranslations } = vi.hoisted(() => ({
  mockGetLocale: vi.fn(),
  mockGetTranslations: vi.fn(),
}));

vi.mock('next-intl/server', () => ({
  getLocale: mockGetLocale,
  getTranslations: mockGetTranslations,
}));

vi.mock('../../../components/IncidentActions', () => ({
  IncidentActions: () => <div>Actions</div>,
}));

const incidentId = '11111111-1111-4111-8111-111111111111';

const incident: IncidentDetail = {
  id: incidentId,
  orderId: '22222222-2222-4222-8222-222222222222',
  type: 'not_delivered',
  status: 'open',
  agentId: '33333333-3333-4333-8333-333333333333',
  resolution: null,
  createdAt: '2026-11-15T10:00:00.000Z',
  updatedAt: '2026-11-15T10:30:00.000Z',
  closedAt: null,
  order: {
    id: '22222222-2222-4222-8222-222222222222',
    customerId: '44444444-4444-4444-8444-444444444444',
    routeId: null,
    address: 'Main Street 10',
    status: 'failed',
  },
  customer: {
    id: '44444444-4444-4444-8444-444444444444',
    name: 'Test Customer',
    phone: '+34600000000',
    locale: 'en',
  },
  driver: null,
  events: [
    {
      id: '55555555-5555-4555-8555-555555555555',
      incidentId,
      fromStatus: null,
      toStatus: 'open',
      actor: 'system',
      actorId: null,
      reason: 'Incident created',
      occurredAt: '2026-11-15T10:00:00.000Z',
    },
  ],
  communications: [],
  evidence: [],
};

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server.resetHandlers();
  vi.clearAllMocks();
});

afterAll(() => {
  server.close();
});

describe('IncidentPage', () => {
  it('loads the incident through the API and renders its details', async () => {
    let requestActor: string | null = null;

    mockGetLocale.mockResolvedValue('en');
    mockGetTranslations.mockResolvedValue((key: string, values?: { id?: string }) => {
      if (key === 'title') {
        return 'Incident';
      }

      if (key === 'reference') {
        return `Incident ${values?.id}`;
      }

      if (key === 'type.not_delivered') {
        return 'Not delivered';
      }

      if (key === 'actor.system') {
        return 'System';
      }

      return key;
    });

    server.use(
      http.get('http://localhost:3000/incidents/:id', ({ request, params }) => {
        expect(params.id).toBe(incidentId);
        requestActor = request.headers.get('x-dev-actor');

        return HttpResponse.json(incident);
      }),
    );

    const page = await IncidentPage({
      params: Promise.resolve({ id: incidentId }),
    });

    const { getByRole, getByText } = renderWithIntl(page);

    expect(await getByRole('heading', { name: 'Incident' })).toBeTruthy();
    expect(getByText(`Incident ${incidentId}`)).toBeTruthy();
    expect(getByText('Test Customer')).toBeTruthy();
    expect(getByText('Main Street 10')).toBeTruthy();
    expect(getByText(/Incident created/)).toBeTruthy();
    expect(requestActor).toMatch(/^agent:/);
  });
});
