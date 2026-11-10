import { DEFAULT_PAGE_LIMIT, listIncidentsQuerySchema } from '@csl/contracts';
import { INCIDENT_STATUSES } from '@csl/shared-types';

import type { ListIncidentsQuery } from '@csl/contracts';

export type SearchParams = Record<string, string | string[] | undefined>;

export const ASSIGNEE_ME = 'me';

export const SORT_OPTIONS = [
  { value: 'createdAt:asc', labelKey: 'createdAsc' },
  { value: 'createdAt:desc', labelKey: 'createdDesc' },
  { value: 'updatedAt:asc', labelKey: 'updatedAsc' },
  { value: 'updatedAt:desc', labelKey: 'updatedDesc' },
] as const;

export const DEFAULT_SORT = 'createdAt:asc';

const ACTIVE_STATUSES = INCIDENT_STATUSES.filter((status) => status !== 'resolved');
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const START_OF_DAY = 'T00:00:00.000Z';
const END_OF_DAY = 'T23:59:59.999Z';

export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function withTime(value: unknown, time: string): unknown {
  return typeof value === 'string' && DATE_ONLY.test(value) ? `${value}${time}` : value;
}

function parseSort(value: unknown) {
  const option = SORT_OPTIONS.find((candidate) => candidate.value === value)?.value ?? DEFAULT_SORT;
  const [sort, order] = option.split(':');

  return { sort, order };
}

function parsePage(value: string | string[] | undefined): number {
  const page = Number.parseInt(firstParam(value) ?? '', 10);

  return Number.isNaN(page) ? 1 : Math.max(1, page);
}

const DEFAULT_QUERY = { status: ACTIVE_STATUSES, ...parseSort(DEFAULT_SORT) };

export function parseInboxQuery(params: SearchParams, agentId: string): ListIncidentsQuery {
  const raw: Record<string, unknown> = Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== ''),
  );

  const result = listIncidentsQuerySchema.safeParse({
    ...DEFAULT_QUERY,
    ...raw,
    ...parseSort(raw.sort),
    agentId: raw.agentId === ASSIGNEE_ME ? agentId : raw.agentId,
    createdFrom: withTime(raw.createdFrom, START_OF_DAY),
    createdTo: withTime(raw.createdTo, END_OF_DAY),
    limit: DEFAULT_PAGE_LIMIT,
    offset: (parsePage(params.page) - 1) * DEFAULT_PAGE_LIMIT,
  });

  return result.success ? result.data : listIncidentsQuerySchema.parse(DEFAULT_QUERY);
}

export function pageHref(params: SearchParams, page: number): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (key === 'page') {
      continue;
    }

    for (const item of Array.isArray(value) ? value : [value]) {
      if (item !== undefined) {
        search.append(key, item);
      }
    }
  }

  if (page > 1) {
    search.set('page', String(page));
  }

  const queryString = search.toString();

  return queryString === '' ? '/inbox' : `/inbox?${queryString}`;
}
