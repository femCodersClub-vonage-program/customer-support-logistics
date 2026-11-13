import { z } from 'zod';

export const uuidSchema = z.uuid();

export const isoDateTimeSchema = z.iso.datetime({ offset: true });

export const API_ERROR_CODES = [
  'BAD_REQUEST',
  'VALIDATION_FAILED',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'INVALID_TRANSITION',
  'TRANSITION_NOT_ALLOWED_FOR_ACTOR',
  'RATE_LIMITED',
  'HTTP_ERROR',
  'INTERNAL_ERROR',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export const apiErrorDetailSchema = z
  .object({
    path: z.string(),
    message: z.string(),
  })
  .meta({ id: 'ApiErrorDetail' });

export type ApiErrorDetail = z.infer<typeof apiErrorDetailSchema>;

export const apiErrorResponseSchema = z
  .object({
    error: z.object({
      code: z.enum(API_ERROR_CODES),
      message: z.string(),
      details: z.array(apiErrorDetailSchema).optional(),
    }),
  })
  .meta({ id: 'ApiErrorResponse' });

export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;

export const DEFAULT_PAGE_LIMIT = 20;

export const MAX_PAGE_LIMIT = 100;

export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_LIMIT).default(DEFAULT_PAGE_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

export function paginatedSchema<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    total: z.number().int().min(0),
    limit: z.number().int().min(1),
    offset: z.number().int().min(0),
  });
}

export interface Paginated<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}
