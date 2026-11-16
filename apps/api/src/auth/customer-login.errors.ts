import { HttpStatus } from '@nestjs/common';

import type { ApiErrorCode } from '@csl/contracts';

export type CustomerLoginFailure = 'wrong_code' | 'expired' | 'too_many_attempts' | 'blocked';

interface FailureReply {
  status: HttpStatus;
  code: ApiErrorCode;
  message: string;
}

const REPLY_BY_FAILURE: Record<CustomerLoginFailure, FailureReply> = {
  wrong_code: {
    status: HttpStatus.UNAUTHORIZED,
    code: 'INVALID_CODE',
    message: 'The code is not correct',
  },
  expired: {
    status: HttpStatus.GONE,
    code: 'VERIFICATION_EXPIRED',
    message: 'The code has expired, ask for a new one',
  },
  too_many_attempts: {
    status: HttpStatus.GONE,
    code: 'TOO_MANY_ATTEMPTS',
    message: 'Too many wrong codes, ask for a new one',
  },
  blocked: {
    status: HttpStatus.TOO_MANY_REQUESTS,
    code: 'RATE_LIMITED',
    message: 'Too many attempts for this number, wait a few minutes and try again',
  },
};

export class CustomerLoginError extends Error {
  override readonly name = 'CustomerLoginError';
  readonly status: HttpStatus;
  readonly code: ApiErrorCode;

  constructor(readonly failure: CustomerLoginFailure) {
    const { status, code, message } = REPLY_BY_FAILURE[failure];
    super(message);
    this.status = status;
    this.code = code;
  }
}
