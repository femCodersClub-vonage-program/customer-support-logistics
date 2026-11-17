import { z } from 'zod';

import { isoDateTimeSchema, uuidSchema } from './common.js';

export const createClientTokenBodySchema = z
  .object({
    incidentId: uuidSchema,
  })
  .meta({ id: 'CreateClientTokenBody' });

export type CreateClientTokenBody = z.infer<typeof createClientTokenBodySchema>;

export const clientTokenResponseSchema = z
  .object({
    token: z.string(),
    userName: z.string(),
    expiresAt: isoDateTimeSchema,
  })
  .meta({ id: 'ClientTokenResponse' });

export type ClientTokenResponse = z.infer<typeof clientTokenResponseSchema>;
