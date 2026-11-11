import { listIncidentsQuerySchema } from '@csl/contracts';
import { INCIDENT_STATUSES } from '@csl/shared-types';

import { endOfDay, startOfDay } from './zoned-day';

import type { ListIncidentsQuery } from '@csl/contracts';

export type SearchParams = Record<string, string | string[] | undefined>;

export interface ParsedInboxQuery {
  query: ListIncidentsQuery;
  params: SearchParams;
}

export const ASSIGNEE_ME = 'me';

const ACTIVE_STATUSES = INCIDENT_STATUSES.filter((status) => status !== 'resolved');
const DEFAULT_QUERY = { status: ACTIVE_STATUSES, order: 'asc' } as const;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function toBound(value: unknown, bound: (date: string) => string): unknown {
  return typeof value === 'string' && DATE_ONLY.test(value) ? bound(value) : value;
}

function parseStatus(value: string | string[] | undefined) {
  if (value === undefined) {
    return DEFAULT_QUERY.status;
  }

  const selected = [value].flat().filter((status) => status !== '');

  return selected.length > 0 ? selected : undefined;
}

function toInput(params: SearchParams, agentId: string) {
  const raw: Record<string, unknown> = Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== ''),
  );

  return {
    ...DEFAULT_QUERY,
    ...raw,
    status: parseStatus(params.status),
    agentId: raw.agentId === ASSIGNEE_ME ? agentId : raw.agentId,
    createdFrom: toBound(raw.createdFrom, startOfDay),
    createdTo: toBound(raw.createdTo, endOfDay),
  };
}

export function parseInboxQuery(params: SearchParams, agentId: string): ParsedInboxQuery {
  const result = listIncidentsQuerySchema.safeParse(toInput(params, agentId));

  if (result.success) {
    return { query: result.data, params };
  }

  const failed = new Set(result.error.issues.map(({ path }) => path[0]));
  const applied = Object.fromEntries(Object.entries(params).filter(([key]) => !failed.has(key)));

  return {
    query: listIncidentsQuerySchema.parse(toInput(applied, agentId)),
    params: applied,
  };
}
