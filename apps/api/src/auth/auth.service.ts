import { randomBytes } from 'node:crypto';

import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { DATABASE } from '../database/database.constants.js';
import { agents, customers } from '../database/schema/index.js';

import { hashPassword, verifyPassword } from './password.js';
import { SessionsService } from './sessions.service.js';

import type { AuthActor } from './auth-actor.js';
import type { CreatedSession } from './sessions.service.js';
import type { Database } from '../database/database.constants.js';
import type { AgentLoginBody, CurrentUser } from '@csl/contracts';

const INVALID_CREDENTIALS = 'Invalid email or password';

export interface AgentLogin {
  session: CreatedSession;
  user: CurrentUser;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  private decoyHash: Promise<string> | undefined;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(SessionsService) private readonly sessions: SessionsService,
  ) {}

  async loginAgent({ email, password }: AgentLoginBody): Promise<AgentLogin> {
    const [agent] = await this.db
      .select({ id: agents.id, name: agents.name, passwordHash: agents.passwordHash })
      .from(agents)
      .where(eq(agents.email, email))
      .limit(1);

    const matches = await verifyPassword(password, agent?.passwordHash ?? (await this.decoy()));

    if (!agent?.passwordHash || !matches) {
      this.logger.warn('Agent login rejected: invalid credentials');
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const session = await this.sessions.create({ role: 'agent', id: agent.id });
    this.logger.log(`Agent ${agent.id} logged in`);

    return { session, user: { role: 'agent', id: agent.id, name: agent.name } };
  }

  async logout(token: string | null): Promise<void> {
    if (token) {
      await this.sessions.revoke(token);
    }
  }

  async currentUser(actor: AuthActor): Promise<CurrentUser> {
    const table = actor.role === 'customer' ? customers : agents;
    const [row] = await this.db
      .select({ name: table.name })
      .from(table)
      .where(eq(table.id, actor.id))
      .limit(1);

    if (!row) {
      throw new UnauthorizedException('The session belongs to someone who no longer exists');
    }

    return { ...actor, name: row.name };
  }

  private decoy(): Promise<string> {
    this.decoyHash ??= hashPassword(randomBytes(16).toString('base64url'));

    return this.decoyHash;
  }
}
