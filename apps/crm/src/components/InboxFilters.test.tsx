import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithIntl } from '../test/render';

import { InboxFilters } from './InboxFilters';

const ACTIVE = ['open', 'notified', 'in_mediation', 'escalated'] as const;

describe('InboxFilters', () => {
  it('checks the given statuses', () => {
    renderWithIntl(<InboxFilters params={{}} status={ACTIVE} />);

    expect(screen.getByRole('checkbox', { name: 'Open' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Resolved' })).not.toBeChecked();
  });

  it('fills the fields from the URL params', () => {
    renderWithIntl(
      <InboxFilters params={{ q: 'lucia', type: 'damaged', agentId: 'me' }} status={ACTIVE} />,
    );

    expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue('lucia');
    expect(screen.getByRole('combobox', { name: 'Type' })).toHaveValue('damaged');
    expect(screen.getByRole('combobox', { name: 'Assigned to' })).toHaveValue('me');
  });

  it('submits with GET so the filters end up in the URL', () => {
    renderWithIntl(<InboxFilters params={{}} status={ACTIVE} />);

    const form = screen.getByRole('button', { name: 'Filter' }).closest('form');

    expect(form).toHaveAttribute('method', 'get');
    expect(form).toHaveAttribute('action', '/inbox');
  });
});