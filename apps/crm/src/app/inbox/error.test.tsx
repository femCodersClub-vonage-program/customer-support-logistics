import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithIntl } from '../../test/render';

import InboxError from './error';

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

describe('InboxError', () => {
  beforeEach(() => {
    refresh.mockReset();
  });

  it('shows a clear message without the technical error', () => {
    renderWithIntl(<InboxError error={new Error('connection refused')} reset={vi.fn()} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Could not load the incidents.');
    expect(screen.queryByText('connection refused')).not.toBeInTheDocument();
  });

  it('asks the server for the incidents again and resets the error boundary', () => {
    const reset = vi.fn();

    renderWithIntl(<InboxError error={new Error('boom')} reset={reset} />);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(refresh).toHaveBeenCalledOnce();
    expect(reset).toHaveBeenCalledOnce();
  });
});
