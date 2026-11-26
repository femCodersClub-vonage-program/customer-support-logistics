import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { setupServer } from 'msw/node';
import { MemoryRouter } from 'react-router';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../App.tsx';
import { SessionProvider } from '../auth/session.tsx';
import { CUSTOMER, ordersOf, sessionOf } from '../test/app.tsx';

import { LOCALE_KEY } from './locale.ts';
import { LocaleProvider } from './LocaleProvider.tsx';
import { LocaleSwitcher } from './LocaleSwitcher.tsx';

const ORDER_ID = '3c4d5e6f-0000-4000-8000-000000000001';

const server = setupServer(sessionOf(CUSTOMER), ordersOf());

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterAll(() => server.close());

function setBrowserLanguages(languages: string[]) {
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(languages);
}

function renderAppAt(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={queryClient}>
      <LocaleProvider>
        <LocaleSwitcher />
        <MemoryRouter initialEntries={[path]}>
          <SessionProvider>
            <App />
          </SessionProvider>
        </MemoryRouter>
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

describe('LocaleProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.lang = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses the first supported browser language', async () => {
    setBrowserLanguages(['fr-FR', 'en-GB', 'es']);
    renderAppAt('/orders');

    expect(await screen.findByRole('heading', { name: 'My orders' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');
  });

  it('falls back to Spanish when no browser language is supported', async () => {
    setBrowserLanguages(['fr-FR', 'de']);
    renderAppAt('/orders');

    expect(await screen.findByRole('heading', { name: 'Mis pedidos' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('es');
  });

  it('prefers the saved choice over the browser languages', async () => {
    setBrowserLanguages(['en-US']);
    localStorage.setItem(LOCALE_KEY, 'es');
    renderAppAt('/orders');

    expect(await screen.findByRole('heading', { name: 'Mis pedidos' })).toBeInTheDocument();
  });

  it('ignores an unsupported saved value', async () => {
    setBrowserLanguages(['en-US']);
    localStorage.setItem(LOCALE_KEY, 'fr');
    renderAppAt('/orders');

    expect(await screen.findByRole('heading', { name: 'My orders' })).toBeInTheDocument();
  });

  it('switches language on the current page, updates <html lang> and remembers the choice', async () => {
    setBrowserLanguages(['es-ES']);
    renderAppAt(`/report/${ORDER_ID}`);

    expect(
      await screen.findByRole('heading', { name: 'Reportar una incidencia' }),
    ).toBeInTheDocument();
    expect(screen.getByText(`Pedido ${ORDER_ID}`)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Idioma'), { target: { value: 'en' } });

    expect(screen.getByRole('heading', { name: 'Report an incident' })).toBeInTheDocument();
    expect(screen.getByText(`Order ${ORDER_ID}`)).toBeInTheDocument();
    expect(screen.getByLabelText('Language')).toHaveValue('en');
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem(LOCALE_KEY)).toBe('en');
  });

  it('lists every language in its own name', async () => {
    setBrowserLanguages(['en']);
    renderAppAt('/orders');

    expect(await screen.findByRole('option', { name: 'Español' })).toHaveAttribute('lang', 'es');
    expect(screen.getByRole('option', { name: 'English' })).toHaveAttribute('lang', 'en');
  });
});
