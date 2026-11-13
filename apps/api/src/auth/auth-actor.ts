import type { AuthRole } from '@csl/contracts';
import type { Request } from 'express';

export interface AuthActor {
  role: AuthRole;
  id: string;
}

export interface AuthenticatedRequest extends Request {
  actor?: AuthActor;
}
