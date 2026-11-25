import { ApiError } from '@csl/api-client';

const MAX_RETRIES = 3;

export function shouldRetry(failureCount: number, error: Error): boolean {
  if (error instanceof ApiError && error.status < 500) {
    return false;
  }

  return failureCount < MAX_RETRIES;
}
