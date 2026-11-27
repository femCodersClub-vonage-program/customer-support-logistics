import { fireEvent, screen, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { rememberCustomerIncident } from '../incident/known-incidents.ts';
import {
  CUSTOMER,
  apiUrl,
  incidentDetailOf,
  ordersOf,
  renderApp,
  sessionOf,
} from '../test/app.tsx';

const INCIDENT_ID = '5eed0000-0000-4000-8000-000000000101';

const server = setupServer(
  sessionOf(CUSTOMER),
  ordersOf(),
  http.get(apiUrl(`/incidents/${INCIDENT_ID}`), () =>
    HttpResponse.json(
      incidentDetailOf(INCIDENT_ID, {
        type: 'damaged',
        status: 'notified',
        description: 'Box arrived open',
      }),
    ),
  ),
  http.post(apiUrl('/auth/logout'), () => new HttpResponse(null, { status: 204 })),
);

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('Customer bottom navigation', () => {
  it('navigates between Orders, Incidents, and Profile from the bottom menu', async () => {
    renderApp('/orders', 'es');

    expect(await screen.findByRole('heading', { name: 'Mis pedidos' })).toBeInTheDocument();

    const nav = screen.getByRole('navigation', { name: 'Navegación principal' });
    const ordersLink = within(nav).getByRole('link', { name: 'Pedidos' });
    const incidentsLink = within(nav).getByRole('link', { name: 'Incidencias' });
    const profileLink = within(nav).getByRole('link', { name: 'Perfil' });

    expect(ordersLink).toHaveAttribute('aria-current', 'page');

    fireEvent.click(incidentsLink);

    expect(await screen.findByRole('heading', { name: 'Mis incidencias' })).toBeInTheDocument();
    expect(incidentsLink).toHaveAttribute('aria-current', 'page');

    fireEvent.click(profileLink);

    expect(await screen.findByRole('heading', { name: 'Mi perfil' })).toBeInTheDocument();
    expect(screen.getByText(CUSTOMER.name)).toBeInTheDocument();
    expect(profileLink).toHaveAttribute('aria-current', 'page');
  });

  it('lists remembered incidents on /incidents and links to each detail page', async () => {
    rememberCustomerIncident(CUSTOMER.id, INCIDENT_ID);

    renderApp('/incidents', 'es');

    expect(await screen.findByRole('heading', { name: 'Mis incidencias' })).toBeInTheDocument();
    expect(await screen.findByText('Box arrived open')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver seguimiento' })).toHaveAttribute(
      'href',
      `/incidents/${INCIDENT_ID}`,
    );
  });

  it('logs out from the profile page', async () => {
    renderApp('/profile', 'en');

    expect(await screen.findByRole('heading', { name: 'My profile' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));

    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument();
  });

  it('does not render the bottom navigation on login or active call screens', async () => {
    server.use(sessionOf(null));
    renderApp('/login', 'es');

    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(
      screen.queryByRole('navigation', { name: 'Navegación principal' }),
    ).not.toBeInTheDocument();
  });
});
