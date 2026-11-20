import { describe, expect, it } from 'vitest';

import { toE164 } from './phone.ts';

describe('toE164', () => {
  it.each([
    ['ES', '600 000 001', '+34600000001'],
    ['ES', '600-00-00-01', '+34600000001'],
    ['GB', '07700 900001', '+447700900001'],
    ['GB', '7700 900001', '+447700900001'],
    ['ES', '+44 7700 900001', '+447700900001'],
  ] as const)('turns %s %s into %s', (country, number, phone) => {
    expect(toE164(country, number)).toBe(phone);
  });

  it.each([
    ['ES', ''],
    ['ES', '600 abc'],
    ['ES', '123'],
    ['ES', '+34 6'],
  ] as const)('rejects %s %j', (country, number) => {
    expect(toE164(country, number)).toBeNull();
  });
});
