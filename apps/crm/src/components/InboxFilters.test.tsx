import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithIntl } from '../test/render';

import { InboxFilters } from './InboxFilters';

const ACTIVE = ['open', 'notified', 'in_mediation', 'escalated'] as const;
const COUNTS = { open: 3, notified: 0, in_mediation: 1, resolved: 2, escalated: 1 };

function submitted() {
  const form = screen.getByRole('button', { name: 'Filter' }).closest('form') as HTMLFormElement;

  return new FormData(form);
}

describe('InboxFilters', () => {
  it('checks the given statuses', () => {
    renderWithIntl(<InboxFilters params={{}} status={ACTIVE} counts={COUNTS} />);

    expect(screen.getByRole('checkbox', { name: 'Open (3)' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Resolved (2)' })).not.toBeChecked();
  });

  it('shows how many incidents each status has, also when there are none', () => {
    renderWithIntl(<InboxFilters params={{}} status={ACTIVE} counts={COUNTS} />);

    expect(screen.getByRole('checkbox', { name: 'Notified (0)' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'In mediation (1)' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Escalated (1)' })).toBeInTheDocument();
  });

  it('shows the counts in Spanish', () => {
    renderWithIntl(<InboxFilters params={{}} status={ACTIVE} counts={COUNTS} />, {
      locale: 'es',
    });

    expect(screen.getByRole('checkbox', { name: 'Abierta (3)' })).toBeInTheDocument();
  });

  it('summarises the selected statuses in the dropdown button, without counts', () => {
    renderWithIntl(<InboxFilters params={{}} status={['open', 'resolved']} counts={COUNTS} />);

    expect(screen.getByText('Open, Resolved')).toBeInTheDocument();
  });

  it('shows "Any" in the dropdown button when no status is selected', () => {
    renderWithIntl(<InboxFilters params={{}} status={[]} counts={COUNTS} />);

    expect(screen.getByText('Any', { selector: 'summary' })).toBeInTheDocument();
  });

  it('always sends a status, so that no status checked means any status', () => {
    renderWithIntl(<InboxFilters params={{}} status={[]} counts={COUNTS} />);

    expect(submitted().getAll('status')).toEqual(['']);
  });

  it('sends the checked statuses after the empty one', () => {
    renderWithIntl(<InboxFilters params={{}} status={['open', 'resolved']} counts={COUNTS} />);

    expect(submitted().getAll('status')).toEqual(['', 'open', 'resolved']);
  });

  it('fills the fields from the URL params', () => {
    renderWithIntl(
      <InboxFilters
        params={{ q: 'lucia', type: 'damaged', agentId: 'me' }}
        status={ACTIVE}
        counts={COUNTS}
      />,
    );

    expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue('lucia');
    expect(screen.getByRole('combobox', { name: 'Type' })).toHaveValue('damaged');
    expect(screen.getByRole('combobox', { name: 'Assigned to' })).toHaveValue('me');
  });

  it('keeps the current sort when the filters are applied', () => {
    renderWithIntl(
      <InboxFilters params={{ sort: 'updatedAt:desc' }} status={ACTIVE} counts={COUNTS} />,
    );

    expect(submitted().get('sort')).toBe('updatedAt:desc');
  });

  it('does not send a sort when the URL has none', () => {
    renderWithIntl(<InboxFilters params={{}} status={ACTIVE} counts={COUNTS} />);

    expect(submitted().has('sort')).toBe(false);
  });

  it('submits with GET so the filters end up in the URL', () => {
    renderWithIntl(<InboxFilters params={{}} status={ACTIVE} counts={COUNTS} />);

    const form = screen.getByRole('button', { name: 'Filter' }).closest('form');

    expect(form).toHaveAttribute('method', 'get');
    expect(form).toHaveAttribute('action', '/inbox');
  });
});
