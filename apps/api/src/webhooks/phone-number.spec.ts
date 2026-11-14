import { describe, expect, it } from 'vitest';

import { toE164 } from './phone-number.js';

describe('toE164', () => {
  it('adds the plus sign Vonage leaves out', () => {
    expect(toE164('34600000009')).toBe('+34600000009');
  });

  it('keeps numbers that already are E.164', () => {
    expect(toE164('+34600000009')).toBe('+34600000009');
  });

  it.each([undefined, '', 'Vonage', 'agent-ana', '0034600000009', '+1234567890123456', '+'])(
    'returns null for %j',
    (value) => {
      expect(toE164(value)).toBeNull();
    },
  );
});
