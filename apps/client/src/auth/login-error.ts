import { ApiError } from '@csl/api-client';

export type LoginError =
  'invalidPhone' | 'wrongCode' | 'expired' | 'tooManyAttempts' | 'wait' | 'offline' | 'generic';

const ERROR_BY_CODE: Partial<Record<string, LoginError>> = {
  INVALID_CODE: 'wrongCode',
  VERIFICATION_EXPIRED: 'expired',
  TOO_MANY_ATTEMPTS: 'tooManyAttempts',
  RATE_LIMITED: 'wait',
};

export function toLoginError(
  error: unknown,
  invalidInput: LoginError = 'invalidPhone',
): LoginError {
  if (error instanceof ApiError) {
    if (error.code === 'VALIDATION_FAILED') {
      return invalidInput;
    }

    return (error.code && ERROR_BY_CODE[error.code]) ?? 'generic';
  }

  const lostConnection =
    error instanceof TypeError || (error instanceof DOMException && error.name === 'TimeoutError');

  return lostConnection ? 'offline' : 'generic';
}
