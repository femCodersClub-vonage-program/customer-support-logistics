import { describe, expect, it } from 'vitest';

import { maskPhone } from './mask-phone.js';

describe('maskPhone', () => {
  it('keeps the country prefix and the last three digits of an E.164 number', () => {
    expect(maskPhone('+34611000009')).toBe('+34******009');
  });

  it('keeps the first two and the last three digits of a number without +', () => {
    expect(maskPhone('34611000009')).toBe('34******009');
  });

  it('masks every character of a number too short to show any part of', () => {
    expect(maskPhone('+34611')).toBe('******');
    expect(maskPhone('')).toBe('');
  });
});
