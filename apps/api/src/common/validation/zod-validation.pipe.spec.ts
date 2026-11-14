import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { RequestValidationError } from '../errors/request-validation.error.js';

import { ZodValidationPipe } from './zod-validation.pipe.js';

const schema = z.object({
  name: z.string().min(1),
  limit: z.coerce.number().int().default(20),
  tags: z.array(z.string()).optional(),
});

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(schema);

  it('returns the parsed output, with coercion and defaults applied', () => {
    expect(pipe.transform({ name: 'Ana' })).toEqual({ name: 'Ana', limit: 20 });
    expect(pipe.transform({ name: 'Ana', limit: '5' })).toEqual({ name: 'Ana', limit: 5 });
  });

  it('throws a RequestValidationError with one detail per offending field', () => {
    const error = (() => {
      try {
        pipe.transform({ name: '', limit: 'abc', tags: ['ok', 1] });
      } catch (caught) {
        return caught;
      }
    })();

    expect(error).toBeInstanceOf(RequestValidationError);
    expect((error as RequestValidationError).details.map(({ path }) => path)).toEqual([
      'name',
      'limit',
      'tags.1',
    ]);
  });

  it('reports an empty path for errors on the whole value', () => {
    expect(() => pipe.transform(undefined)).toThrow(RequestValidationError);

    try {
      pipe.transform(undefined);
    } catch (caught) {
      expect((caught as RequestValidationError).details).toEqual([
        { path: '', message: expect.any(String) as string },
      ]);
    }
  });
});
