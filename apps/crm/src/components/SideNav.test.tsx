import { screen } from '@testing-library/react';
import { usePathname } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithIntl } from '../test/render';

import { SideNav } from './SideNav';

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(),
}));

describe('SideNav', () => {
  beforeEach(() => {
    vi.mocked(usePathname).mockReset();
  });

  it('renders a link to the inbox', () => {
    vi.mocked(usePathname).mockReturnValue('/incidents/123');

    renderWithIntl(<SideNav />);

    const link = screen.getByRole('link', { name: 'Inbox' });

    expect(link).toHaveAttribute('href', '/inbox');
    expect(link).not.toHaveAttribute('aria-current');
  });

  it('marks the inbox link as the current page when on the inbox', () => {
    vi.mocked(usePathname).mockReturnValue('/inbox');

    renderWithIntl(<SideNav />);

    expect(screen.getByRole('link', { name: 'Inbox' })).toHaveAttribute('aria-current', 'page');
  });

  it('renders the navigation in Spanish', () => {
    vi.mocked(usePathname).mockReturnValue('/inbox');

    renderWithIntl(<SideNav />, { locale: 'es' });

    expect(screen.getByRole('navigation', { name: 'Principal' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Bandeja de entrada' })).toHaveAttribute(
      'href',
      '/inbox',
    );
  });
});
