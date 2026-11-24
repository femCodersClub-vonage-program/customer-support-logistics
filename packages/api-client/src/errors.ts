import { API_ERROR_CODES } from '@csl/contracts';

import type { ApiErrorCode } from '@csl/contracts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return API_ERROR_CODES.some((code) => code === value);
}

export class ApiError extends Error {
  override readonly name = 'ApiError';
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }

  get code(): ApiErrorCode | undefined {
    const error = isRecord(this.body) ? this.body.error : undefined;

    return isRecord(error) && isApiErrorCode(error.code) ? error.code : undefined;
  }
}
