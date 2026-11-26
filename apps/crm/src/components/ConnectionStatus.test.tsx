import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useEvents } from '../lib/events/EventsProvider';
import { renderWithIntl } from '../test/render';

import { ConnectionStatus } from './ConnectionStatus';

vi.mock('../lib/events/EventsProvider', () => ({ useEvents: vi.fn() }));

function withState(state: 'connecting' | 'connected' | 'reconnecting') {
  vi.mocked(useEvents).mockReturnValue({ state, subscribe: vi.fn() });
}

describe('ConnectionStatus', () => {
  it('shows that the connection is live', () => {
    withState('connected');
    renderWithIntl(<ConnectionStatus />);

    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('shows that it is reconnecting', () => {
    withState('reconnecting');
    renderWithIntl(<ConnectionStatus />);

    expect(screen.getByText('Reconnecting…')).toBeInTheDocument();
  });

  it('shows the state in Spanish', () => {
    withState('connecting');
    renderWithIntl(<ConnectionStatus />, { locale: 'es' });

    expect(screen.getByText('Conectando…')).toBeInTheDocument();
  });

  it('is not announced to screen readers on every change', () => {
    withState('connected');
    renderWithIntl(<ConnectionStatus />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
