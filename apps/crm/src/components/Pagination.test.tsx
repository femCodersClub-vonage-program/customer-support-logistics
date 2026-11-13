import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithIntl } from '../test/render';

import { Pagination } from './Pagination';

describe('Pagination', () => {
  it('shows the position and only a next link on the first page', () => {
    renderWithIntl(<Pagination params={{}} total={65} limit={20} offset={0} />);

    expect(screen.getByText('Page 1 of 4 · 65 incidents')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Previous' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Next' })).toHaveAttribute('href', '/inbox?page=2');
  });

  it('keeps the filters in both links', () => {
    renderWithIntl(
      <Pagination
        params={{ q: 'lucia', status: ['open', 'escalated'] }}
        total={65}
        limit={20}
        offset={20}
      />,
    );

    expect(screen.getByRole('link', { name: 'Previous' })).toHaveAttribute(
      'href',
      '/inbox?q=lucia&status=open&status=escalated',
    );
    expect(screen.getByRole('link', { name: 'Next' })).toHaveAttribute(
      'href',
      '/inbox?q=lucia&status=open&status=escalated&page=3',
    );
  });

  it('has no next link on the last page', () => {
    renderWithIntl(<Pagination params={{}} total={65} limit={20} offset={60} />);

    expect(screen.queryByRole('link', { name: 'Next' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Previous' })).toBeInTheDocument();
  });

  it('renders in Spanish', () => {
    renderWithIntl(<Pagination params={{}} total={1} limit={20} offset={0} />, { locale: 'es' });

    expect(screen.getByText('Página 1 de 1 · 1 incidencia')).toBeInTheDocument();
  });
});
