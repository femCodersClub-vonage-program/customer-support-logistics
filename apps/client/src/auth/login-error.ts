import { ApiError } from '@csl/api-client';

export type LoginError =
  'invalidPhone' | 'wrongCode' | 'expired' | 'tooManyAttempts' | 'wait' | 'offline' | 'generic';

const ERROR_BY_CODE: Partial<Record<string, LoginError>> = {
  VALIDATION_FAILED: 'invalidPhone',
  INVALID_CODE: 'wrongCode',
  VERIFICATION_EXPIRED: 'expired',
  TOO_MANY_ATTEMPTS: 'tooManyAttempts',
  RATE_LIMITED: 'wait',
};

export function toLoginError(error: unknown): LoginError {
  if (error instanceof ApiError) {
    return (error.code && ERROR_BY_CODE[error.code]) ?? 'generic';
  }

  return error instanceof TypeError ? 'offline' : 'generic';
}
