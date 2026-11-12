import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithIntl } from '../test/render';

import { RelativeTime } from './RelativeTime';

describe('RelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-02T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the relative time and keeps the exact date in the title', () => {
    renderWithIntl(<RelativeTime value="2026-11-02T11:55:00.000Z" />);

    const time = screen.getByText('5 minutes ago');

    expect(time).toHaveAttribute('datetime', '2026-11-02T11:55:00.000Z');
    expect(time).toHaveAttribute('title');
    expect(time.getAttribute('title')).not.toBe('');
  });

  it('formats the relative time in Spanish', () => {
    renderWithIntl(<RelativeTime value="2026-11-02T11:55:00.000Z" />, { locale: 'es' });

    expect(screen.getByText('hace 5 minutos')).toBeInTheDocument();
  });
});
