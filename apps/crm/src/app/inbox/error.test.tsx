import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderWithIntl } from '../../test/render';

import InboxError from './error';

describe('InboxError', () => {
  it('shows a clear message without the technical error', () => {
    renderWithIntl(<InboxError error={new Error('connection refused')} reset={vi.fn()} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Could not load the incidents.');
    expect(screen.queryByText('connection refused')).not.toBeInTheDocument();
  });

  it('retries when the button is pressed', () => {
    const reset = vi.fn();

    renderWithIntl(<InboxError error={new Error('boom')} reset={reset} />);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(reset).toHaveBeenCalledOnce();
  });
});
