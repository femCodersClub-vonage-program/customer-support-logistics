import { Catch, HttpException, HttpStatus, Inject, Logger } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

import {
  InvalidTransitionError,
  UnauthorizedTransitionError,
} from '../../incidents/domain/transition.errors.js';
import { VonageError } from '../../vonage/vonage.errors.js';

import { RequestValidationError } from './request-validation.error.js';

import type { ApiErrorCode, ApiErrorResponse } from '@csl/contracts';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';

export interface ApiErrorReply {
  status: number;
  body: ApiErrorResponse;
}

const CODE_BY_STATUS: Partial<Record<number, ApiErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
  [HttpStatus.BAD_GATEWAY]: 'BAD_GATEWAY',
};

interface ExposedHttpError {
  statusCode: number;
  message: string;
  expose: true;
}

function isExposedHttpError(exception: unknown): exception is ExposedHttpError {
  return (
    typeof exception === 'object' &&
    exception !== null &&
    'expose' in exception &&
    exception.expose === true &&
    'statusCode' in exception &&
    typeof exception.statusCode === 'number' &&
    'message' in exception &&
    typeof exception.message === 'string'
  );
}

function reply(status: number, code: ApiErrorCode, message: string): ApiErrorReply {
  return { status, body: { error: { code, message } } };
}

function fromStatus(status: number, message: string): ApiErrorReply {
  return reply(status, CODE_BY_STATUS[status] ?? 'HTTP_ERROR', message);
}

export function toApiErrorReply(exception: unknown): ApiErrorReply {
  if (exception instanceof RequestValidationError) {
    return {
      status: HttpStatus.BAD_REQUEST,
      body: {
        error: {
          code: 'VALIDATION_FAILED',
          message: exception.message,
          details: exception.details,
        },
      },
    };
  }

  if (exception instanceof InvalidTransitionError) {
    return reply(HttpStatus.CONFLICT, 'INVALID_TRANSITION', exception.message);
  }

  if (exception instanceof UnauthorizedTransitionError) {
    return reply(HttpStatus.CONFLICT, 'TRANSITION_NOT_ALLOWED_FOR_ACTOR', exception.message);
  }

  if (exception instanceof VonageError) {
    return reply(
      HttpStatus.BAD_GATEWAY,
      'BAD_GATEWAY',
      `Vonage could not complete "${exception.operation}", try again`,
    );
  }

  if (exception instanceof HttpException) {
    return fromStatus(exception.getStatus(), exception.message);
  }

  if (isExposedHttpError(exception)) {
    return fromStatus(exception.statusCode, exception.message);
  }

  return reply(HttpStatus.INTERNAL_SERVER_ERROR, 'INTERNAL_ERROR', 'Internal server error');
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  constructor(@Inject(HttpAdapterHost) private readonly adapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { status, body } = toApiErrorReply(exception);

    if (status >= 500) {
      this.logger.error(
        exception instanceof Error ? (exception.stack ?? exception.message) : String(exception),
      );
    }

    this.adapterHost.httpAdapter.reply(host.switchToHttp().getResponse(), body, status);
  }
}
