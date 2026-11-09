import { describe, expect, it } from 'vitest';

import { diffMessageKeys } from './testing.js';

describe('diffMessageKeys', () => {
  it('returns no differences for trees with the same keys', () => {
    expect(diffMessageKeys({ a: 'A', b: { c: 'C' } }, { a: 'x', b: { c: 'y' } })).toEqual({
      missing: [],
      extra: [],
    });
  });

  it('reports nested keys missing from the candidate and extra keys in it', () => {
    expect(
      diffMessageKeys({ a: 'A', b: { c: 'C', d: 'D' } }, { b: { c: 'C', e: 'E' }, f: 'F' }),
    ).toEqual({ missing: ['a', 'b.d'], extra: ['b.e', 'f'] });
  });

  it('treats a string and a group with the same name as different keys', () => {
    expect(diffMessageKeys({ a: 'A' }, { a: { b: 'B' } })).toEqual({
      missing: ['a'],
      extra: ['a.b'],
    });
  });
});
