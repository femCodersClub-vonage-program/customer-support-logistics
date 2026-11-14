import { z } from 'zod';

import { uuidSchema } from './common.js';
import { actorSchema } from './incidents.js';

export const authRoleSchema = actorSchema.extract(['customer', 'agent']).meta({ id: 'AuthRole' });

export type AuthRole = z.infer<typeof authRoleSchema>;

export const agentLoginBodySchema = z
  .object({
    email: z.string().trim().toLowerCase().pipe(z.email()),
    password: z.string().min(1).max(256),
  })
  .meta({ id: 'AgentLoginBody' });

export type AgentLoginBody = z.infer<typeof agentLoginBodySchema>;

export const customerLoginStartBodySchema = z
  .object({
    phone: z.string().trim().pipe(z.e164()),
  })
  .meta({ id: 'CustomerLoginStartBody' });

export type CustomerLoginStartBody = z.infer<typeof customerLoginStartBodySchema>;

export const customerLoginStartResponseSchema = z
  .discriminatedUnion('channel', [
    z.object({ channel: z.literal('sms') }),
    z.object({ channel: z.literal('silent_auth'), checkUrl: z.url() }),
  ])
  .meta({ id: 'CustomerLoginStartResponse' });

export type CustomerLoginStartResponse = z.infer<typeof customerLoginStartResponseSchema>;

export const customerLoginCheckBodySchema = z
  .object({
    code: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9]{4,10}$/),
    requestId: z.string().trim().min(1).max(100).optional(),
  })
  .meta({ id: 'CustomerLoginCheckBody' });

export type CustomerLoginCheckBody = z.infer<typeof customerLoginCheckBodySchema>;

export const currentUserSchema = z
  .object({
    role: authRoleSchema,
    id: uuidSchema,
    name: z.string(),
  })
  .meta({ id: 'CurrentUser' });

export type CurrentUser = z.infer<typeof currentUserSchema>;
