import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { highlight, isHighlighted, resetHighlights } from './highlights';

beforeEach(() => {
  vi.useFakeTimers();
  resetHighlights();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('highlights', () => {
  it('marks an incident and clears it after a while', () => {
    highlight(['a']);

    expect(isHighlighted('a')).toBe(true);
    expect(isHighlighted('b')).toBe(false);

    vi.advanceTimersByTime(3000);

    expect(isHighlighted('a')).toBe(false);
  });

  it('restarts the time when the same incident changes again', () => {
    highlight(['a']);
    vi.advanceTimersByTime(2000);
    highlight(['a']);
    vi.advanceTimersByTime(2000);

    expect(isHighlighted('a')).toBe(true);
  });
});
