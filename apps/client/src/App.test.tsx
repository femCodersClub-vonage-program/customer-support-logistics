import { screen } from '@testing-library/react';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { CUSTOMER, renderApp, sessionOf } from './test/app.tsx';

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
    renderApp('/report/123');

    expect(await screen.findByRole('heading', { name: 'Report an incident' })).toBeInTheDocument();
    expect(screen.getByText('Order 123')).toBeInTheDocument();
  });

  it('renders the not found page for unknown paths', async () => {
    renderApp('/unknown');

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });

  it('renders the pages in Spanish', async () => {
    renderApp('/report/123', 'es');

    expect(
      await screen.findByRole('heading', { name: 'Reportar una incidencia' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Pedido 123')).toBeInTheDocument();
  });

  it('sends a visitor without a session to the login page', async () => {
    server.use(sessionOf(null));
    renderApp('/report/123');

    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument();
  });
});
