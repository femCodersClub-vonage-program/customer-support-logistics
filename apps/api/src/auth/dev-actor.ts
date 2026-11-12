import { authRoleSchema, uuidSchema } from '@csl/contracts';
import { z } from 'zod';

import type { AuthActor } from './auth-actor.js';

export const DEV_ACTOR_HEADER = 'x-dev-actor';

const devActorHeaderSchema = z
  .string()
  .transform((value) => value.split(':'))
  .pipe(z.tuple([authRoleSchema, uuidSchema]))
  .transform(([role, id]): AuthActor => ({ role, id }));

export function parseDevActor(header: unknown): AuthActor | null {
  const result = devActorHeaderSchema.safeParse(header);

  return result.success ? result.data : null;
}
