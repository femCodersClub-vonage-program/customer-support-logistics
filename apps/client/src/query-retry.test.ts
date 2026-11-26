import { ApiError } from '@csl/api-client';
import { describe, expect, it } from 'vitest';

import { shouldRetry } from './query-retry.ts';

describe('shouldRetry', () => {
  it('does not retry client errors', () => {
    expect(shouldRetry(0, new ApiError('Not found', 404, null))).toBe(false);
  });

  it('retries server and network errors up to three times', () => {
    expect(shouldRetry(0, new ApiError('Unavailable', 503, null))).toBe(true);
    expect(shouldRetry(2, new TypeError('Failed to fetch'))).toBe(true);
    expect(shouldRetry(3, new TypeError('Failed to fetch'))).toBe(false);
  });
});
