import { describe, expect, it } from 'vitest';

import { maskPhone } from './mask-phone.js';

describe('maskPhone', () => {
  it('keeps only the last three digits of an E.164 number', () => {
    expect(maskPhone('+34600123456')).toBe('+********456');
  });

  it('masks numbers without a leading plus, as Vonage sends them', () => {
    expect(maskPhone('34600123456')).toBe('********456');
  });

  it('ignores separators', () => {
    expect(maskPhone('+34 600 12 34 56')).toBe('+********456');
  });

  it('masks very short numbers completely', () => {
    expect(maskPhone('123')).toBe('***');
    expect(maskPhone('')).toBe('');
  });
});
