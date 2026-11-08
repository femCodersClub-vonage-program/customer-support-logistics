import { actorSchema, uuidSchema } from '@csl/contracts';
import { z } from 'zod';

import type { Request } from 'express';

export const DEV_ACTOR_HEADER = 'x-dev-actor';

export const devActorRoleSchema = actorSchema.extract(['customer', 'agent']);

export type DevActorRole = z.infer<typeof devActorRoleSchema>;

export interface DevActor {
  role: DevActorRole;
  id: string;
}

export interface DevActorRequest extends Request {
  devActor?: DevActor;
}

const devActorHeaderSchema = z
  .string()
  .transform((value) => value.split(':'))
  .pipe(z.tuple([devActorRoleSchema, uuidSchema]))
  .transform(([role, id]): DevActor => ({ role, id }));

export function parseDevActor(header: unknown): DevActor | null {
  const result = devActorHeaderSchema.safeParse(header);

  return result.success ? result.data : null;
}
