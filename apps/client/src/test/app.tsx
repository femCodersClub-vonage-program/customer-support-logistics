import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HttpResponse, http } from 'msw';
import { MemoryRouter } from 'react-router';

import { App } from '../App.tsx';
import { SessionProvider } from '../auth/session.tsx';

import { renderWithIntl } from './render.tsx';

import type { CurrentUser, IncidentDetail } from '@csl/contracts';
import type { Locale, Order } from '@csl/shared-types';

export const CUSTOMER: CurrentUser = {
  role: 'customer',
  id: '5eed0000-0000-4000-8000-0000000000c1',
  name: 'Lucía Martín',
};

export const apiUrl = (path: string) => new URL(`/api${path}`, window.location.origin).href;

export const apiError = (status: number, code: string) =>
  HttpResponse.json({ error: { code, message: code } }, { status });

export const sessionOf = (user: CurrentUser | null) =>
  http.get(apiUrl('/auth/me'), () =>
    user === null ? apiError(401, 'UNAUTHORIZED') : HttpResponse.json(user),
  );

export const ordersOf = (orders: Order[] = []) =>
  http.get(apiUrl('/orders'), () => HttpResponse.json({ items: orders }));

const INCIDENT_ORDER_ID = '3c4d5e6f-0000-4000-8000-000000000001';

export const incidentDetailOf = (
  id: string,
  overrides: Partial<IncidentDetail> = {},
): IncidentDetail => ({
  id,
  orderId: INCIDENT_ORDER_ID,
  type: 'damaged',
  status: 'notified',
  agentId: null,
  resolution: null,
  createdAt: '2026-11-20T09:30:00.000Z',
  updatedAt: '2026-11-20T10:15:00.000Z',
  closedAt: null,
  description: null,
  order: {
    id: INCIDENT_ORDER_ID,
    customerId: CUSTOMER.id,
    routeId: null,
    address: 'Calle Mayor 1, Madrid',
    status: 'delivered',
  },
  customer: { id: CUSTOMER.id, name: CUSTOMER.name, phone: '+34600000001', locale: 'en' },
  driver: null,
  events: [],
  communications: [],
  evidence: [],
  mediationInvite: null,
  ...overrides,
});

export const incidentOf = (detail: IncidentDetail) =>
  http.get(apiUrl(`/incidents/${detail.id}`), () => HttpResponse.json(detail));

export function renderApp(path: string, locale: Locale = 'en') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return renderWithIntl(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <SessionProvider>
          <App />
        </SessionProvider>
      </MemoryRouter>
    </QueryClientProvider>,
    { locale },
  );
}
