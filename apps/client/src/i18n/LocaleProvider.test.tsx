import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../App.tsx';

import { LOCALE_KEY } from './locale.ts';
import { LocaleProvider } from './LocaleProvider.tsx';
import { LocaleSwitcher } from './LocaleSwitcher.tsx';

function setBrowserLanguages(languages: string[]) {
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(languages);
}

function renderAppAt(path: string) {
  return render(
    <LocaleProvider>
      <LocaleSwitcher />
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </LocaleProvider>,
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

  it('uses the first supported browser language', () => {
    setBrowserLanguages(['fr-FR', 'en-GB', 'es']);
    renderAppAt('/orders');

    expect(screen.getByRole('heading', { name: 'My orders' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');
  });

  it('falls back to Spanish when no browser language is supported', () => {
    setBrowserLanguages(['fr-FR', 'de']);
    renderAppAt('/orders');

    expect(screen.getByRole('heading', { name: 'Mis pedidos' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('es');
  });

  it('prefers the saved choice over the browser languages', () => {
    setBrowserLanguages(['en-US']);
    localStorage.setItem(LOCALE_KEY, 'es');
    renderAppAt('/orders');

    expect(screen.getByRole('heading', { name: 'Mis pedidos' })).toBeInTheDocument();
  });

  it('ignores an unsupported saved value', () => {
    setBrowserLanguages(['en-US']);
    localStorage.setItem(LOCALE_KEY, 'fr');
    renderAppAt('/orders');

    expect(screen.getByRole('heading', { name: 'My orders' })).toBeInTheDocument();
  });

  it('switches language on the current page, updates <html lang> and remembers the choice', () => {
    setBrowserLanguages(['es-ES']);
    renderAppAt('/report/123');

    expect(screen.getByRole('heading', { name: 'Reportar una incidencia' })).toBeInTheDocument();
    expect(screen.getByText('Pedido 123')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Idioma'), { target: { value: 'en' } });

    expect(screen.getByRole('heading', { name: 'Report an incident' })).toBeInTheDocument();
    expect(screen.getByText('Order 123')).toBeInTheDocument();
    expect(screen.getByLabelText('Language')).toHaveValue('en');
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem(LOCALE_KEY)).toBe('en');
  });

  it('lists every language in its own name', () => {
    setBrowserLanguages(['en']);
    renderAppAt('/orders');

    expect(screen.getByRole('option', { name: 'Español' })).toHaveAttribute('lang', 'es');
    expect(screen.getByRole('option', { name: 'English' })).toHaveAttribute('lang', 'en');
  });
});
