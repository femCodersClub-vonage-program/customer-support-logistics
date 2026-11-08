import type { ApiErrorDetail } from '@csl/contracts';
import type { z } from 'zod';

export class RequestValidationError extends Error {
  override readonly name = 'RequestValidationError';
  readonly details: ApiErrorDetail[];

  constructor(error: z.ZodError) {
    super('Request validation failed');
    this.details = error.issues.map((issue) => ({
      path: issue.path.map(String).join('.'),
      message: issue.message,
    }));
  }
}
