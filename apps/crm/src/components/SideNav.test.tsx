import { screen } from '@testing-library/react';
import { usePathname, useSearchParams } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithIntl } from '../test/render';

import { SideNav } from './SideNav';

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(),
  useSearchParams: vi.fn(),
}));

describe('SideNav', () => {
  beforeEach(() => {
    vi.mocked(usePathname).mockReset();
    vi.mocked(useSearchParams)
      .mockReset()
      .mockReturnValue(new URLSearchParams() as never);
  });

  it('renders links for inbox views', () => {
    vi.mocked(usePathname).mockReturnValue('/incidents/123');

    renderWithIntl(<SideNav />);

    const inbox = screen.getByRole('link', { name: 'Inbox' });

    expect(inbox).toHaveAttribute('href', '/inbox');
    expect(inbox).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'My tickets' })).toHaveAttribute(
      'href',
      '/inbox?agentId=me',
    );
    expect(screen.getByRole('link', { name: 'Escalated' })).toHaveAttribute(
      'href',
      '/inbox?status=escalated',
    );
    expect(screen.getByRole('link', { name: 'Resolved' })).toHaveAttribute(
      'href',
      '/inbox?status=resolved',
    );
  });

  it('marks the inbox link as the current page when on the inbox', () => {
    vi.mocked(usePathname).mockReturnValue('/inbox');

    renderWithIntl(<SideNav />);

    expect(screen.getByRole('link', { name: 'Inbox' })).toHaveAttribute('aria-current', 'page');
  });

  it('marks My tickets as active when filtering by agentId=me', () => {
    vi.mocked(usePathname).mockReturnValue('/inbox');
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams('agentId=me') as never);

    renderWithIntl(<SideNav />);

    expect(screen.getByRole('link', { name: 'My tickets' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Inbox' })).not.toHaveAttribute('aria-current');
  });

  it('renders the navigation in Spanish', () => {
    vi.mocked(usePathname).mockReturnValue('/inbox');

    renderWithIntl(<SideNav />, { locale: 'es' });

    expect(screen.getByRole('navigation', { name: 'Principal' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Bandeja de entrada' })).toHaveAttribute(
      'href',
      '/inbox',
    );
    expect(screen.getByRole('link', { name: 'Mis tickets' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Escalados' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Resueltos' })).toBeInTheDocument();
  });
});
