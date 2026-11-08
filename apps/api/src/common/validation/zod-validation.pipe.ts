import { RequestValidationError } from '../errors/request-validation.error.js';

import type { PipeTransform } from '@nestjs/common';
import type { z } from 'zod';

export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform<unknown, z.output<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      throw new RequestValidationError(result.error);
    }

    return result.data;
  }
}
