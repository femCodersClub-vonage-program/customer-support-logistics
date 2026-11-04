import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import { App } from './App.tsx';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
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
});
