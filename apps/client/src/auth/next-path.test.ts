import { describe, expect, it } from 'vitest';

import { DEFAULT_PATH, safeNextPath } from './next-path.ts';

describe('safeNextPath', () => {
  it('keeps an internal path with its query', () => {
    expect(safeNextPath('/report/42?from=sms')).toBe('/report/42?from=sms');
  });

  it.each([null, '', 'https://evil.com', '//evil.com', '/\\evil.com', 'orders'])(
    'falls back to the orders page for %j',
    (next) => {
      expect(safeNextPath(next)).toBe(DEFAULT_PATH);
    },
  );
});
