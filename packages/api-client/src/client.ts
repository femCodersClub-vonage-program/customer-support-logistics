import { ApiError } from './errors.js';

import type {
  AgentLoginBody,
  ChangeIncidentStatusBody,
  CreateIncidentBody,
  ClientTokenResponse,
  CurrentUser,
  CustomerLoginCheckBody,
  CustomerLoginStartBody,
  CustomerLoginStartResponse,
  EvidenceDownload,
  EvidenceUploadUrl,
  IncidentDetail,
  ListIncidentsQueryInput,
  ListIncidentsResponse,
  ListOrdersResponse,
  StartMediationResponse,
  RequestEvidenceUploadBody,
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
  listOrders(options?: RequestOptions): Promise<ListOrdersResponse>;
  listIncidents(
    query?: ListIncidentsQueryInput,
    options?: RequestOptions,
  ): Promise<ListIncidentsResponse>;
  createIncident(body: CreateIncidentBody, options?: RequestOptions): Promise<Incident>;
  getIncident(id: string, options?: RequestOptions): Promise<IncidentDetail>;
  assignIncidentToMe(id: string, options?: RequestOptions): Promise<Incident>;
  notifyDriver(id: string, options?: RequestOptions): Promise<Incident>;
  notifyDriverAgain(
    id: string,
    idempotencyKey: string,
    options?: RequestOptions,
  ): Promise<Incident>;
  changeIncidentStatus(
    id: string,
    body: ChangeIncidentStatusBody,
    options?: RequestOptions,
  ): Promise<Incident>;
  startMediation(incidentId: string, options?: RequestOptions): Promise<StartMediationResponse>;
  callDriver(incidentId: string, options?: RequestOptions): Promise<Communication>;
  createClientToken(incidentId: string, options?: RequestOptions): Promise<ClientTokenResponse>;
  getCurrentUser(options?: RequestOptions): Promise<CurrentUser>;
  agentLogin(body: AgentLoginBody, options?: RequestOptions): Promise<CurrentUser>;
  startCustomerLogin(
    body: CustomerLoginStartBody,
    options?: RequestOptions,
  ): Promise<CustomerLoginStartResponse>;
  moveCustomerLoginToSms(options?: RequestOptions): Promise<void>;
  checkCustomerLogin(body: CustomerLoginCheckBody, options?: RequestOptions): Promise<CurrentUser>;
  logout(options?: RequestOptions): Promise<void>;
  requestEvidenceUpload(
    incidentId: string,
    body: RequestEvidenceUploadBody,
    options?: RequestOptions,
  ): Promise<EvidenceUploadUrl>;
  completeEvidenceUpload(
    incidentId: string,
    evidenceId: string,
    options?: RequestOptions,
  ): Promise<void>;
  listEvidence(incidentId: string, options?: RequestOptions): Promise<EvidenceDownload[]>;
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
    listOrders: ({ signal } = {}) =>
      request<ListOrdersResponse>('/orders', {
        method: 'GET',
        signal,
      }),
    listIncidents: (query = {}, { signal } = {}) =>
      request<ListIncidentsResponse>(`/incidents${toQueryString(query)}`, {
        method: 'GET',
        signal,
      }),
    createIncident: (body, { signal } = {}) =>
      request<Incident>('/incidents', postJson(body, signal)),
    getIncident: (id, { signal } = {}) =>
      request<IncidentDetail>(`/incidents/${encodeURIComponent(id)}`, {
        method: 'GET',
        signal,
      }),
    assignIncidentToMe: (id, { signal } = {}) =>
      request<Incident>(`/incidents/${encodeURIComponent(id)}/assign-to-me`, {
        method: 'POST',
        signal,
      }),
    notifyDriver: (id, { signal } = {}) =>
      request<Incident>(`/incidents/${encodeURIComponent(id)}/notify-driver`, {
        method: 'POST',
        signal,
      }),
    notifyDriverAgain: (id, idempotencyKey, { signal } = {}) =>
      request<Incident>(`/incidents/${encodeURIComponent(id)}/notify-driver/again`, {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        signal,
      }),
    changeIncidentStatus: (id, body, { signal } = {}) =>
      request<Incident>(`/incidents/${encodeURIComponent(id)}/status`, {
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
    createClientToken: (incidentId, { signal } = {}) =>
      request<ClientTokenResponse>('/vonage/client-token', postJson({ incidentId }, signal)),
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
    requestEvidenceUpload: (incidentId, body, { signal } = {}) =>
      request<EvidenceUploadUrl>(
        `/incidents/${encodeURIComponent(incidentId)}/evidence/upload-url`,
        postJson(body, signal),
      ),
    completeEvidenceUpload: (incidentId, evidenceId, { signal } = {}) =>
      request<void>(
        `/incidents/${encodeURIComponent(incidentId)}/evidence/${encodeURIComponent(evidenceId)}/complete`,
        { method: 'POST', signal },
      ),
    listEvidence: (incidentId, { signal } = {}) =>
      request<EvidenceDownload[]>(`/incidents/${encodeURIComponent(incidentId)}/evidence`, {
        method: 'GET',
        signal,
      }),
  };
}
