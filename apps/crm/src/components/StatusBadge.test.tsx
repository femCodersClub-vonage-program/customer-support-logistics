import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithIntl } from '../test/render';

import { StatusBadge } from './StatusBadge';

describe('StatusBadge', () => {
  it('shows the status as text, not only as colour', () => {
    renderWithIntl(<StatusBadge status="in_mediation" />);

    expect(screen.getByText('In mediation')).toHaveAttribute('data-status', 'in_mediation');
  });

  it('renders the status in Spanish', () => {
    renderWithIntl(<StatusBadge status="escalated" />, { locale: 'es' });

    expect(screen.getByText('Escalada')).toBeInTheDocument();
  });
});
