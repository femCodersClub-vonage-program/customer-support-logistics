import { describe, expect, it } from 'vitest';

import { readCookie } from './session-cookie.js';

describe('readCookie', () => {
  it('finds the cookie among others', () => {
    expect(readCookie('NEXT_LOCALE=es; csl_session=abc-123_x; theme=dark', 'csl_session')).toBe(
      'abc-123_x',
    );
  });

  it('does not match a cookie whose name only ends with the one asked for', () => {
    expect(readCookie('old_csl_session=stale', 'csl_session')).toBeNull();
  });

  it.each([undefined, '', 'csl_session', 'csl_session=', 'theme=dark'])(
    'returns null for %j',
    (header) => {
      expect(readCookie(header, 'csl_session')).toBeNull();
    },
  );
});
