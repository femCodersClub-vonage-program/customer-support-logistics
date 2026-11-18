import { z } from 'zod';

import type { AuthActor } from '../auth/auth-actor.js';

const PREFIX_BY_ROLE = {
  customer: 'cust',
  agent: 'agent',
} as const satisfies Record<AuthActor['role'], string>;

const ROLE_BY_PREFIX = Object.fromEntries(
  Object.entries(PREFIX_BY_ROLE).map(([role, prefix]) => [prefix, role]),
) as Partial<Record<string, AuthActor['role']>>;

const userNamePattern = /^(?<prefix>[a-z]+)-(?<id>.+)$/;

export function vonageUserName({ role, id }: AuthActor): string {
  return `${PREFIX_BY_ROLE[role]}-${id}`;
}

export function parseVonageUserName(name: string | undefined): AuthActor | null {
  const groups = name === undefined ? undefined : userNamePattern.exec(name)?.groups;

  if (groups?.prefix === undefined || groups.id === undefined) {
    return null;
  }

  const role = ROLE_BY_PREFIX[groups.prefix];

  if (role === undefined || !z.uuid().safeParse(groups.id).success) {
    return null;
  }

  return { role, id: groups.id };
}
