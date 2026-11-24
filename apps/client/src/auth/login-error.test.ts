import { ApiError } from '@csl/api-client';
import { describe, expect, it } from 'vitest';

import { toLoginError } from './login-error.ts';

describe('toLoginError', () => {
  it('treats a network failure and a timeout as a lost connection', () => {
    expect(toLoginError(new TypeError('Failed to fetch'))).toBe('offline');
    expect(toLoginError(new DOMException('Timed out', 'TimeoutError'))).toBe('offline');
  });

  it('uses the given message for invalid input', () => {
    const invalid = new ApiError('x', 400, { error: { code: 'VALIDATION_FAILED' } });

    expect(toLoginError(invalid)).toBe('invalidPhone');
    expect(toLoginError(invalid, 'wrongCode')).toBe('wrongCode');
  });

  it('falls back to a generic message', () => {
    expect(toLoginError(new ApiError('x', 500, undefined))).toBe('generic');
    expect(toLoginError(new Error('boom'))).toBe('generic');
  });
});
