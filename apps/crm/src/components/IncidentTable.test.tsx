import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithIntl } from '../test/render';

import { IncidentTable } from './IncidentTable';

import type { IncidentListItem } from '@csl/contracts';

const incident: IncidentListItem = {
  id: 'a1b2c3d4-0000-4000-8000-000000000001',
  orderId: 'b2c3d4e5-0000-4000-8000-000000000002',
  type: 'damaged',
  status: 'open',
  agentId: null,
  resolution: null,
  createdAt: '2026-11-02T10:00:00.000Z',
  updatedAt: '2026-11-02T10:30:00.000Z',
  closedAt: null,
  customer: { id: 'c3d4e5f6-0000-4000-8000-000000000003', name: 'Lucía Martín' },
};

const defaultSort = { params: {}, sort: 'createdAt', order: 'asc' } as const;

describe('IncidentTable', () => {
  it('renders one row per incident with its data', () => {
    renderWithIntl(<IncidentTable items={[incident]} {...defaultSort} />);

    const row = screen.getAllByRole('row')[1] as HTMLElement;

    expect(within(row).getByText('Damaged')).toBeInTheDocument();
    expect(within(row).getByText('b2c3d4e5')).toBeInTheDocument();
    expect(within(row).getByText('Lucía Martín')).toBeInTheDocument();
    expect(within(row).getByText('Open')).toBeInTheDocument();
    expect(within(row).getByText('Unassigned')).toBeInTheDocument();
  });

  it('links the reference to the incident page', () => {
    renderWithIntl(<IncidentTable items={[incident]} {...defaultSort} />);

    expect(screen.getByRole('link', { name: 'a1b2c3d4' })).toHaveAttribute(
      'href',
      `/incidents/${incident.id}`,
    );
  });

  it('shows a short agent id when the incident is assigned', () => {
    const agentId = '5eed0000-0000-4000-8000-0000000000a1';

    renderWithIntl(<IncidentTable items={[{ ...incident, agentId }]} {...defaultSort} />);

    expect(screen.getByText('5eed0000')).toBeInTheDocument();
    expect(screen.queryByText('Unassigned')).not.toBeInTheDocument();
  });

  it('shows the empty state when there are no incidents', () => {
    renderWithIntl(<IncidentTable items={[]} {...defaultSort} />);

    expect(screen.getByText('No incidents to show.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('renders the column headers in Spanish', () => {
    renderWithIntl(<IncidentTable items={[incident]} {...defaultSort} />, { locale: 'es' });

    expect(screen.getByRole('columnheader', { name: 'Cliente' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Última actualización' })).toBeInTheDocument();
  });

  describe('sorting', () => {
    it('marks the sorted column and leaves the others as they are', () => {
      renderWithIntl(<IncidentTable items={[incident]} {...defaultSort} />);

      expect(screen.getByRole('columnheader', { name: 'Created' })).toHaveAttribute(
        'aria-sort',
        'ascending',
      );
      expect(screen.getByRole('columnheader', { name: 'Last update' })).not.toHaveAttribute(
        'aria-sort',
      );
    });

    it('only makes created and last update sortable', () => {
      renderWithIntl(<IncidentTable items={[incident]} {...defaultSort} />);

      const customer = screen.getByRole('columnheader', { name: 'Customer' });

      expect(within(customer).queryByRole('link')).not.toBeInTheDocument();
    });

    it('reverses the order when the sorted column is clicked again', () => {
      renderWithIntl(<IncidentTable items={[incident]} {...defaultSort} />);

      expect(screen.getByRole('link', { name: 'Created' })).toHaveAttribute(
        'href',
        '/inbox?sort=createdAt%3Adesc',
      );
    });

    it('sorts ascending when another column is chosen', () => {
      renderWithIntl(<IncidentTable items={[incident]} {...defaultSort} />);

      expect(screen.getByRole('link', { name: 'Last update' })).toHaveAttribute(
        'href',
        '/inbox?sort=updatedAt%3Aasc',
      );
    });

    it('shows a descending column and keeps the filters in the links', () => {
      renderWithIntl(
        <IncidentTable
          items={[incident]}
          params={{ q: 'lucia', page: '2' }}
          sort="updatedAt"
          order="desc"
        />,
      );

      expect(screen.getByRole('columnheader', { name: 'Last update' })).toHaveAttribute(
        'aria-sort',
        'descending',
      );
      expect(screen.getByRole('link', { name: 'Last update' })).toHaveAttribute(
        'href',
        '/inbox?q=lucia&sort=updatedAt%3Aasc',
      );
    });
  });
});
