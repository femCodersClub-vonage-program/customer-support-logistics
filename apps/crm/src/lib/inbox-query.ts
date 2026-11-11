import { DEFAULT_PAGE_LIMIT, listIncidentsQuerySchema } from '@csl/contracts';
import { INCIDENT_STATUSES } from '@csl/shared-types';

import { endOfDay, startOfDay } from './zoned-day';

import type { ListIncidentsQuery } from '@csl/contracts';

export type SearchParams = Record<string, string | string[] | undefined>;

export interface ParsedInboxQuery {
  query: ListIncidentsQuery;
  params: SearchParams;
}

export const ASSIGNEE_ME = 'me';

const SORT_VALUES = ['createdAt:asc', 'createdAt:desc', 'updatedAt:asc', 'updatedAt:desc'];
const DEFAULT_SORT = 'createdAt:asc';
const ACTIVE_STATUSES = INCIDENT_STATUSES.filter((status) => status !== 'resolved');
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function toBound(value: unknown, bound: (date: string) => string): unknown {
  return typeof value === 'string' && DATE_ONLY.test(value) ? bound(value) : value;
}

function parseStatus(value: string | string[] | undefined) {
  if (value === undefined) {
    return ACTIVE_STATUSES;
  }

  const selected = [value].flat().filter((status) => status !== '');

  return selected.length > 0 ? selected : undefined;
}

function parsePage(value: string | string[] | undefined): number {
  const page = Number.parseInt(firstParam(value) ?? '', 10);

  return Number.isNaN(page) ? 1 : Math.max(1, page);
}

function toInput(params: SearchParams, agentId: string) {
  const raw: Record<string, unknown> = Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== ''),
  );
  const sortParam = firstParam(params.sort);
  const [sort, order] = (SORT_VALUES.find((value) => value === sortParam) ?? DEFAULT_SORT).split(
    ':',
  );

  return {
    ...raw,
    status: parseStatus(params.status),
    sort,
    order,
    agentId: raw.agentId === ASSIGNEE_ME ? agentId : raw.agentId,
    createdFrom: toBound(raw.createdFrom, startOfDay),
    createdTo: toBound(raw.createdTo, endOfDay),
    limit: DEFAULT_PAGE_LIMIT,
    offset: (parsePage(params.page) - 1) * DEFAULT_PAGE_LIMIT,
  };
}

export function parseInboxQuery(params: SearchParams, agentId: string): ParsedInboxQuery {
  const result = listIncidentsQuerySchema.safeParse(toInput(params, agentId));

  if (result.success) {
    return { query: result.data, params };
  }

  const failed = new Set(result.error.issues.map(({ path }) => path[0]));
  const applied = Object.fromEntries(Object.entries(params).filter(([key]) => !failed.has(key)));

  return Object.keys(applied).length < Object.keys(params).length
    ? parseInboxQuery(applied, agentId)
    : { query: listIncidentsQuerySchema.parse(toInput({}, agentId)), params: {} };
}

function buildHref(params: SearchParams, changes: Record<string, string | undefined>): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (key in changes) {
      continue;
    }

    for (const item of Array.isArray(value) ? value : [value]) {
      if (item !== undefined) {
        search.append(key, item);
      }
    }
  }

  for (const [key, value] of Object.entries(changes)) {
    if (value !== undefined) {
      search.set(key, value);
    }
  }

  const queryString = search.toString();

  return queryString === '' ? '/inbox' : `/inbox?${queryString}`;
}

export function pageHref(params: SearchParams, page: number): string {
  return buildHref(params, { page: page > 1 ? String(page) : undefined });
}

export function sortHref(
  params: SearchParams,
  sort: ListIncidentsQuery['sort'],
  order: ListIncidentsQuery['order'],
): string {
  return buildHref(params, { sort: `${sort}:${order}`, page: undefined });
}
