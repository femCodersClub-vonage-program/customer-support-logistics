import { ApiError } from './errors.js';

import type {
  AgentLoginBody,
  ChangeIncidentStatusBody,
  CreateIncidentBody,
  CurrentUser,
  CustomerLoginCheckBody,
  CustomerLoginStartBody,
  CustomerLoginStartResponse,
  IncidentDetail,
  ListIncidentsQueryInput,
  ListIncidentsResponse,
  StartMediationResponse,
} from '@csl/contracts';
import type { Communication, HealthResponse, Incident } from '@csl/shared-types';

type MaybePromise<T> = T | Promise<T>;

export type TokenProvider = () => MaybePromise<string | null | undefined>;

export const DEFAULT_TIMEOUT_MS = 15_000;

export interface ApiClientOptions {
  baseUrl: string;
  getToken?: TokenProvider;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}

export interface RequestOptions {
  signal?: AbortSignal;
}

export interface ApiClient {
  getHealth(options?: RequestOptions): Promise<HealthResponse>;
  listIncidents(
    query?: ListIncidentsQueryInput,
    options?: RequestOptions,
  ): Promise<ListIncidentsResponse>;
  createIncident(body: CreateIncidentBody, options?: RequestOptions): Promise<Incident>;
  getIncident(incidentId: string, options?: RequestOptions): Promise<IncidentDetail>;
  changeIncidentStatus(
    incidentId: string,
    body: ChangeIncidentStatusBody,
    options?: RequestOptions,
  ): Promise<Incident>;
  startMediation(incidentId: string, options?: RequestOptions): Promise<StartMediationResponse>;
  callDriver(incidentId: string, options?: RequestOptions): Promise<Communication>;
  getCurrentUser(options?: RequestOptions): Promise<CurrentUser>;
  agentLogin(body: AgentLoginBody, options?: RequestOptions): Promise<CurrentUser>;
  startCustomerLogin(
    body: CustomerLoginStartBody,
    options?: RequestOptions,
  ): Promise<CustomerLoginStartResponse>;
  moveCustomerLoginToSms(options?: RequestOptions): Promise<void>;
  checkCustomerLogin(body: CustomerLoginCheckBody, options?: RequestOptions): Promise<CurrentUser>;
  logout(options?: RequestOptions): Promise<void>;
}

async function parseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    return response.json();
  }

  const text = await response.text();

  return text === '' ? undefined : text;
}

function postJson(body: unknown, signal: AbortSignal | undefined): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  };
}

function toQueryString(query: object): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item !== undefined) {
        params.append(key, String(item));
      }
    }
  }

  const queryString = params.toString();

  return queryString === '' ? '' : `?${queryString}`;
}

export function createApiClient({
  baseUrl,
  getToken,
  fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: ApiClientOptions): ApiClient {
  const base = baseUrl.replace(/\/+$/, '');
  const fetchFn: typeof globalThis.fetch =
    fetch ?? ((input, init) => globalThis.fetch(input, init));

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');

    const token = await getToken?.();

    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    const response = await fetchFn(`${base}${path}`, { ...init, headers, signal });
    const body = await parseBody(response);

    if (!response.ok) {
      throw new ApiError(
        `Request to ${path} failed with status ${response.status}`,
        response.status,
        body,
      );
    }

    return body as T;
  }

  return {
    getHealth: ({ signal } = {}) => request<HealthResponse>('/health', { method: 'GET', signal }),
    listIncidents: (query = {}, { signal } = {}) =>
      request<ListIncidentsResponse>(`/incidents${toQueryString(query)}`, {
        method: 'GET',
        signal,
      }),
    createIncident: (body, { signal } = {}) =>
      request<Incident>('/incidents', postJson(body, signal)),
    getIncident: (incidentId, { signal } = {}) =>
      request<IncidentDetail>(`/incidents/${encodeURIComponent(incidentId)}`, {
        method: 'GET',
        signal,
      }),
    changeIncidentStatus: (incidentId, body, { signal } = {}) =>
      request<Incident>(`/incidents/${encodeURIComponent(incidentId)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      }),
    startMediation: (incidentId, { signal } = {}) =>
      request<StartMediationResponse>(`/incidents/${encodeURIComponent(incidentId)}/mediation`, {
        method: 'POST',
        signal,
      }),
    callDriver: (incidentId, { signal } = {}) =>
      request<Communication>(`/incidents/${encodeURIComponent(incidentId)}/mediation/driver-call`, {
        method: 'POST',
        signal,
      }),
    getCurrentUser: ({ signal } = {}) =>
      request<CurrentUser>('/auth/me', { method: 'GET', signal }),
    agentLogin: (body, { signal } = {}) =>
      request<CurrentUser>('/auth/agent/login', postJson(body, signal)),
    startCustomerLogin: (body, { signal } = {}) =>
      request<CustomerLoginStartResponse>('/auth/customer/start', postJson(body, signal)),
    moveCustomerLoginToSms: ({ signal } = {}) =>
      request<void>('/auth/customer/sms', { method: 'POST', signal }),
    checkCustomerLogin: (body, { signal } = {}) =>
      request<CurrentUser>('/auth/customer/check', postJson(body, signal)),
    logout: ({ signal } = {}) => request<void>('/auth/logout', { method: 'POST', signal }),
  };
}
