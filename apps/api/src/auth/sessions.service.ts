import { createHash, randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, sql } from 'drizzle-orm';

import { DATABASE } from '../database/database.constants.js';
import { sessions } from '../database/schema/index.js';

import type { AuthActor } from './auth-actor.js';
import type { Database } from '../database/database.constants.js';
import type { AuthRole } from '@csl/contracts';

const TOKEN_BYTES = 32;
const HOUR_MS = 60 * 60 * 1000;

export const SESSION_LIFETIME_MS: Record<AuthRole, number> = {
  customer: 30 * 24 * HOUR_MS,
  agent: 12 * HOUR_MS,
};

export interface CreatedSession {
  token: string;
  lifetimeMs: number;
}

interface SessionSubject {
  customerId: string | null;
  agentId: string | null;
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('base64url');

function subjectOf(actor: AuthActor): SessionSubject {
  return actor.role === 'customer'
    ? { customerId: actor.id, agentId: null }
    : { customerId: null, agentId: actor.id };
}

function actorOf({ customerId, agentId }: SessionSubject): AuthActor {
  if (customerId) {
    return { role: 'customer', id: customerId };
  }

  if (agentId) {
    return { role: 'agent', id: agentId };
  }

  throw new Error('Session row has neither a customer nor an agent');
}

@Injectable()
export class SessionsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async create(actor: AuthActor): Promise<CreatedSession> {
    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    const lifetimeMs = SESSION_LIFETIME_MS[actor.role];

    await this.db.insert(sessions).values({
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + lifetimeMs),
      ...subjectOf(actor),
    });

    return { token, lifetimeMs };
  }

  async resolve(token: string): Promise<AuthActor | null> {
    const [row] = await this.db
      .select({ customerId: sessions.customerId, agentId: sessions.agentId })
      .from(sessions)
      .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, sql`now()`)))
      .limit(1);

    return row ? actorOf(row) : null;
  }

  async revoke(token: string): Promise<void> {
    await this.db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  }
}
