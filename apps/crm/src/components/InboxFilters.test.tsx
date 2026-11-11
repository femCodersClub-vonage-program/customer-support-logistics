import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithIntl } from '../test/render';

import { InboxFilters } from './InboxFilters';

const ACTIVE = ['open', 'notified', 'in_mediation', 'escalated'] as const;

function submitted() {
  const form = screen.getByRole('button', { name: 'Filter' }).closest('form') as HTMLFormElement;

  return new FormData(form);
}

describe('InboxFilters', () => {
  it('checks the given statuses', () => {
    renderWithIntl(<InboxFilters params={{}} status={ACTIVE} />);

    expect(screen.getByRole('checkbox', { name: 'Open' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Resolved' })).not.toBeChecked();
  });

  it('summarises the selected statuses in the dropdown button', () => {
    renderWithIntl(<InboxFilters params={{}} status={['open', 'resolved']} />);

    expect(screen.getByText('Open, Resolved')).toBeInTheDocument();
  });

  it('shows "Any" in the dropdown button when no status is selected', () => {
    renderWithIntl(<InboxFilters params={{}} status={[]} />);

    expect(screen.getByText('Any', { selector: 'summary' })).toBeInTheDocument();
  });

  it('always sends a status, so that no status checked means any status', () => {
    renderWithIntl(<InboxFilters params={{}} status={[]} />);

    expect(submitted().getAll('status')).toEqual(['']);
  });

  it('sends the checked statuses after the empty one', () => {
    renderWithIntl(<InboxFilters params={{}} status={['open', 'resolved']} />);

    expect(submitted().getAll('status')).toEqual(['', 'open', 'resolved']);
  });

  it('fills the fields from the URL params', () => {
    renderWithIntl(
      <InboxFilters params={{ q: 'lucia', type: 'damaged', agentId: 'me' }} status={ACTIVE} />,
    );

    expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue('lucia');
    expect(screen.getByRole('combobox', { name: 'Type' })).toHaveValue('damaged');
    expect(screen.getByRole('combobox', { name: 'Assigned to' })).toHaveValue('me');
  });

  it('keeps the current sort when the filters are applied', () => {
    renderWithIntl(<InboxFilters params={{ sort: 'updatedAt:desc' }} status={ACTIVE} />);

    expect(submitted().get('sort')).toBe('updatedAt:desc');
  });

  it('does not send a sort when the URL has none', () => {
    renderWithIntl(<InboxFilters params={{}} status={ACTIVE} />);

    expect(submitted().has('sort')).toBe(false);
  });

  it('submits with GET so the filters end up in the URL', () => {
    renderWithIntl(<InboxFilters params={{}} status={ACTIVE} />);

    const form = screen.getByRole('button', { name: 'Filter' }).closest('form');

    expect(form).toHaveAttribute('method', 'get');
    expect(form).toHaveAttribute('action', '/inbox');
  });
});
