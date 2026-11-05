import { ApiError } from './errors.js';

import type { HealthResponse } from '@csl/shared-types';

type MaybePromise<T> = T | Promise<T>;

export type TokenProvider = () => MaybePromise<string | null | undefined>;

export interface ApiClientOptions {
  baseUrl: string;
  getToken?: TokenProvider;
  fetch?: typeof globalThis.fetch;
}

export interface RequestOptions {
  signal?: AbortSignal;
}

export interface ApiClient {
  getHealth(options?: RequestOptions): Promise<HealthResponse>;
}

async function parseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    return response.json();
  }

  const text = await response.text();

  return text === '' ? undefined : text;
}

export function createApiClient({ baseUrl, getToken, fetch }: ApiClientOptions): ApiClient {
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

    const response = await fetchFn(`${base}${path}`, { ...init, headers });
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
  };
}
