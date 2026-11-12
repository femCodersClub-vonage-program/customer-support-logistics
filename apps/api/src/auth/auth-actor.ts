import { ForbiddenException } from '@nestjs/common';

import type { AuthRole } from '@csl/contracts';
import type { Request } from 'express';

export interface AuthActor {
  role: AuthRole;
  id: string;
}

export interface AuthenticatedRequest extends Request {
  actor?: AuthActor;
}

export function requireCustomerId(actor: AuthActor): string {
  if (actor.role !== 'customer') {
    throw new ForbiddenException('Only customers can perform this action');
  }

  return actor.id;
}
