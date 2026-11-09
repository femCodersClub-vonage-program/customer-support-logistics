import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import {
  InvalidTransitionError,
  UnauthorizedTransitionError,
} from '../../incidents/domain/transition.errors.js';

import { ApiExceptionFilter, toApiErrorReply } from './api-exception.filter.js';
import { RequestValidationError } from './request-validation.error.js';

import type { ArgumentsHost } from '@nestjs/common';
import type { HttpAdapterHost } from '@nestjs/core';

describe('toApiErrorReply', () => {
  it('maps request validation errors to 400 with field details', () => {
    const result = z.object({ orderId: z.uuid() }).safeParse({ orderId: 'nope' });
    const error = new RequestValidationError(result.error as z.ZodError);

    expect(toApiErrorReply(error)).toEqual({
      status: 400,
      body: {
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Request validation failed',
          details: [{ path: 'orderId', message: expect.any(String) as string }],
        },
      },
    });
  });

  it('maps an invalid transition to 409', () => {
    expect(toApiErrorReply(new InvalidTransitionError('resolved', 'open'))).toEqual({
      status: 409,
      body: {
        error: {
          code: 'INVALID_TRANSITION',
          message: 'Cannot transition incident from "resolved" to "open"',
        },
      },
    });
  });

  it('maps a transition the actor may not perform to 409', () => {
    expect(toApiErrorReply(new UnauthorizedTransitionError('notified', 'agent'))).toEqual({
      status: 409,
      body: {
        error: {
          code: 'TRANSITION_NOT_ALLOWED_FOR_ACTOR',
          message: 'Actor "agent" cannot transition incident to "notified"',
        },
      },
    });
  });

  it.each([
    [new BadRequestException('Bad'), 400, 'BAD_REQUEST'],
    [new UnauthorizedException('Who?'), 401, 'UNAUTHORIZED'],
    [new ForbiddenException('No'), 403, 'FORBIDDEN'],
    [new NotFoundException('Incident not found'), 404, 'NOT_FOUND'],
    [new HttpException('Conflict', 409), 409, 'CONFLICT'],
    [new HttpException('Slow down', 429), 429, 'RATE_LIMITED'],
    [new HttpException('Teapot', 418), 418, 'HTTP_ERROR'],
    [new ServiceUnavailableException('Down'), 503, 'HTTP_ERROR'],
  ])('maps %s to its status and code', (exception, status, code) => {
    expect(toApiErrorReply(exception)).toEqual({
      status,
      body: { error: { code, message: exception.message } },
    });
  });

  it('maps exposed http-errors, such as malformed JSON bodies, to their status', () => {
    const error = Object.assign(new SyntaxError('Unexpected token'), {
      statusCode: 400,
      expose: true,
    });

    expect(toApiErrorReply(error)).toEqual({
      status: 400,
      body: { error: { code: 'BAD_REQUEST', message: 'Unexpected token' } },
    });
  });

  it('hides unknown errors behind a generic 500', () => {
    const error = Object.assign(new Error('connection refused'), { statusCode: 500 });

    expect(toApiErrorReply(error)).toEqual({
      status: 500,
      body: { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
    });
    expect(toApiErrorReply('boom').status).toBe(500);
  });
});

describe('ApiExceptionFilter', () => {
  const setup = () => {
    const reply = vi.fn();
    const response = {};
    const adapterHost = { httpAdapter: { reply } } as unknown as HttpAdapterHost;
    const host = {
      switchToHttp: () => ({ getResponse: () => response }),
    } as unknown as ArgumentsHost;
    const filter = new ApiExceptionFilter(adapterHost);

    return { filter, host, reply, response };
  };

  it('replies with the mapped body and status', () => {
    const { filter, host, reply, response } = setup();

    filter.catch(new NotFoundException('Incident not found'), host);

    expect(reply).toHaveBeenCalledWith(
      response,
      { error: { code: 'NOT_FOUND', message: 'Incident not found' } },
      404,
    );
  });

  it('logs server errors', () => {
    const { filter, host } = setup();
    const logError = vi
      .spyOn((filter as unknown as { logger: { error: () => void } }).logger, 'error')
      .mockImplementation(() => undefined);

    filter.catch(new Error('boom'), host);
    filter.catch('not an error', host);
    filter.catch(new NotFoundException(), host);

    expect(logError).toHaveBeenCalledTimes(2);
  });
});
