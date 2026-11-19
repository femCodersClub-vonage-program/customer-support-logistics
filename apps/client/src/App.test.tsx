import { screen } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { CUSTOMER, apiUrl, renderApp, sessionOf } from './test/app.tsx';

const ORDER_ID = '3c4d5e6f-0000-4000-8000-000000000001';

const server = setupServer(sessionOf(CUSTOMER));

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('App', () => {
  it('redirects the root path to the orders page', async () => {
    renderApp('/');

    expect(await screen.findByRole('heading', { name: 'My orders' })).toBeInTheDocument();
  });

  it('renders the report page with the order id from the URL', async () => {
    renderApp(`/report/${ORDER_ID}`);

    expect(await screen.findByRole('heading', { name: 'Report an incident' })).toBeInTheDocument();
    expect(screen.getByText(`Order ${ORDER_ID}`)).toBeInTheDocument();
  });

  it('renders the not found page when the order id is not valid', async () => {
    renderApp('/report/123');

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Report an incident' })).not.toBeInTheDocument();
  });

  it('renders the not found page for unknown paths', async () => {
    renderApp('/unknown');

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });

  it('renders the pages in Spanish', async () => {
    renderApp(`/report/${ORDER_ID}`, 'es');

    expect(
      await screen.findByRole('heading', { name: 'Reportar una incidencia' }),
    ).toBeInTheDocument();
    expect(screen.getByText(`Pedido ${ORDER_ID}`)).toBeInTheDocument();
  });

  it('sends a visitor without a session to the login page', async () => {
    server.use(sessionOf(null));
    renderApp(`/report/${ORDER_ID}`);

    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument();
  });

  it('checks the session again when the connection comes back', async () => {
    server.use(http.get(apiUrl('/auth/me'), () => HttpResponse.error(), { once: true }));
    renderApp('/orders');

    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument();

    window.dispatchEvent(new Event('online'));

    expect(await screen.findByRole('heading', { name: 'My orders' })).toBeInTheDocument();
  });
});
