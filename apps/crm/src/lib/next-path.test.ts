import { describe, expect, it } from 'vitest';

import { DEFAULT_PATH, safeNextPath } from './next-path';

describe('safeNextPath', () => {
  it('keeps an internal path with its query', () => {
    expect(safeNextPath('/incidents/1?tab=call')).toBe('/incidents/1?tab=call');
  });

  it.each([
    undefined,
    '',
    'https://evil.com',
    '//evil.com',
    '/\\evil.com',
    '/\t/evil.com',
    '/.//evil.com',
    '/..//evil.com',
    '/a/..//evil.com',
    '/%2e//evil.com',
    'inbox',
  ])('falls back to the inbox for %j', (next) => {
    expect(safeNextPath(next)).toBe(DEFAULT_PATH);
  });
});
