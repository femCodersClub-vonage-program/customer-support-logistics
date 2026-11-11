import { describe, expect, it } from 'vitest';

import { shortId } from './short-id';

describe('shortId', () => {
  it('returns the first 8 characters of the id', () => {
    expect(shortId('a1b2c3d4-0000-4000-8000-000000000000')).toBe('a1b2c3d4');
  });
});
