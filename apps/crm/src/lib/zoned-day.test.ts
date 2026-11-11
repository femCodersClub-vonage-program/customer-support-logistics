import { describe, expect, it } from 'vitest';

import { endOfDay, startOfDay } from './zoned-day';

describe('startOfDay and endOfDay', () => {
  it('use the winter offset (+01:00)', () => {
    expect(startOfDay('2026-11-10')).toBe('2026-11-09T23:00:00.000Z');
    expect(endOfDay('2026-11-10')).toBe('2026-11-10T22:59:59.999Z');
  });

  it('use the summer offset (+02:00)', () => {
    expect(startOfDay('2026-07-01')).toBe('2026-06-30T22:00:00.000Z');
    expect(endOfDay('2026-07-01')).toBe('2026-07-01T21:59:59.999Z');
  });

  it('handle the day the clocks go forward (23 hours)', () => {
    expect(startOfDay('2026-03-29')).toBe('2026-03-28T23:00:00.000Z');
    expect(endOfDay('2026-03-29')).toBe('2026-03-29T21:59:59.999Z');
  });

  it('handle the day the clocks go back (25 hours)', () => {
    expect(startOfDay('2026-10-25')).toBe('2026-10-24T22:00:00.000Z');
    expect(endOfDay('2026-10-25')).toBe('2026-10-25T22:59:59.999Z');
  });

  it('return the input as it is when it is not a real date', () => {
    expect(startOfDay('2026-13-45')).toBe('2026-13-45');
    expect(endOfDay('2026-13-45')).toBe('2026-13-45');
  });
});
