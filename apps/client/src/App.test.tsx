import { screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import { App } from './App.tsx';
import { renderWithIntl } from './test/render.tsx';

import type { Locale } from '@csl/shared-types';

function renderAt(path: string, locale: Locale = 'en') {
  return renderWithIntl(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
    { locale },
  );
}

describe('App', () => {
  it('redirects the root path to the orders page', () => {
    renderAt('/');

    expect(screen.getByRole('heading', { name: 'My orders' })).toBeInTheDocument();
  });

  it('renders the report page with the order id from the URL', () => {
    renderAt('/report/123');

    expect(screen.getByRole('heading', { name: 'Report an incident' })).toBeInTheDocument();
    expect(screen.getByText('Order 123')).toBeInTheDocument();
  });

  it('renders the not found page for unknown paths', () => {
    renderAt('/unknown');

    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });

  it('renders the pages in Spanish', () => {
    renderAt('/report/123', 'es');

    expect(screen.getByRole('heading', { name: 'Reportar una incidencia' })).toBeInTheDocument();
    expect(screen.getByText('Pedido 123')).toBeInTheDocument();
  });
});
