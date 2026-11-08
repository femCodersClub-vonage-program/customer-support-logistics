import { cookies } from 'next/headers';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { setLocale } from './actions';
import { LOCALE_COOKIE } from './locale';

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

const set = vi.fn();

describe('setLocale', () => {
  beforeEach(() => {
    set.mockReset();
    vi.mocked(cookies).mockResolvedValue({ set } as unknown as Awaited<ReturnType<typeof cookies>>);
  });

  it('stores a supported locale in the cookie for a year', async () => {
    await setLocale('en');

    expect(set).toHaveBeenCalledWith(LOCALE_COOKIE, 'en', {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
    });
  });

  it('ignores an unsupported locale', async () => {
    await setLocale('fr');

    expect(set).not.toHaveBeenCalled();
  });
});
