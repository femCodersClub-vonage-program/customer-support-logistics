import { listIncidentsQuerySchema } from '@csl/contracts';
import { INCIDENT_STATUSES } from '@csl/shared-types';

import type { ListIncidentsQuery } from '@csl/contracts';

export type SearchParams = Record<string, string | string[] | undefined>;

export const ASSIGNEE_ME = 'me';

const ACTIVE_STATUSES = INCIDENT_STATUSES.filter((status) => status !== 'resolved');
const DEFAULT_QUERY = { status: ACTIVE_STATUSES, order: 'asc' } as const;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const START_OF_DAY = 'T00:00:00.000Z';
const END_OF_DAY = 'T23:59:59.999Z';

export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function withTime(value: unknown, time: string): unknown {
  return typeof value === 'string' && DATE_ONLY.test(value) ? `${value}${time}` : value;
}

export function parseInboxQuery(params: SearchParams, agentId: string): ListIncidentsQuery {
  const raw: Record<string, unknown> = Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== ''),
  );

  const result = listIncidentsQuerySchema.safeParse({
    ...DEFAULT_QUERY,
    ...raw,
    agentId: raw.agentId === ASSIGNEE_ME ? agentId : raw.agentId,
    createdFrom: withTime(raw.createdFrom, START_OF_DAY),
    createdTo: withTime(raw.createdTo, END_OF_DAY),
  });

  return result.success ? result.data : listIncidentsQuerySchema.parse(DEFAULT_QUERY);
}