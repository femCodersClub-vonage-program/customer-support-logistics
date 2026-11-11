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

describe('IncidentTable', () => {
  it('renders one row per incident with its data', () => {
    renderWithIntl(<IncidentTable items={[incident]} />);

    const row = screen.getAllByRole('row')[1] as HTMLElement;

    expect(within(row).getByText('Damaged')).toBeInTheDocument();
    expect(within(row).getByText('b2c3d4e5')).toBeInTheDocument();
    expect(within(row).getByText('Lucía Martín')).toBeInTheDocument();
    expect(within(row).getByText('Open')).toBeInTheDocument();
    expect(within(row).getByText('Unassigned')).toBeInTheDocument();
  });

  it('links the reference to the incident page', () => {
    renderWithIntl(<IncidentTable items={[incident]} />);

    expect(screen.getByRole('link', { name: 'a1b2c3d4' })).toHaveAttribute(
      'href',
      `/incidents/${incident.id}`,
    );
  });

  it('shows a short agent id when the incident is assigned', () => {
    const agentId = '5eed0000-0000-4000-8000-0000000000a1';

    renderWithIntl(<IncidentTable items={[{ ...incident, agentId }]} />);

    expect(screen.getByText('5eed0000')).toBeInTheDocument();
    expect(screen.queryByText('Unassigned')).not.toBeInTheDocument();
  });

  it('shows the empty state when there are no incidents', () => {
    renderWithIntl(<IncidentTable items={[]} />);

    expect(screen.getByText('No incidents to show.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('renders the column headers in Spanish', () => {
    renderWithIntl(<IncidentTable items={[incident]} />, { locale: 'es' });

    expect(screen.getByRole('columnheader', { name: 'Cliente' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Última actualización' })).toBeInTheDocument();
  });
});
