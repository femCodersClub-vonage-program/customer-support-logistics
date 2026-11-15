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

export const currentUserSchema = z
  .object({
    role: authRoleSchema,
    id: uuidSchema,
    name: z.string(),
  })
  .meta({ id: 'CurrentUser' });

export type CurrentUser = z.infer<typeof currentUserSchema>;
