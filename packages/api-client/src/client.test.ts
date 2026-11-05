import { describe, expect, it, vi } from 'vitest';

import { createApiClient } from './client.js';
import { ApiError } from './errors.js';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function requestFrom(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>) {
  const [url, init] = fetchMock.mock.calls[0] ?? [];

  return { url, headers: new Headers(init?.headers) };
}

describe('createApiClient', () => {
  it('fetches the health status from the base URL', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({ status: 'ok', version: '1.2.3' }),
    );
    const client = createApiClient({ baseUrl: '/api/', fetch: fetchMock });

    await expect(client.getHealth()).resolves.toEqual({ status: 'ok', version: '1.2.3' });

    const { url, headers } = requestFrom(fetchMock);

    expect(url).toBe('/api/health');
    expect(headers.get('Accept')).toBe('application/json');
    expect(headers.has('Authorization')).toBe(false);
  });

  it('sends the bearer token when a token provider returns one', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({ status: 'ok', version: '1.2.3' }),
    );
    const client = createApiClient({
      baseUrl: '/api',
      fetch: fetchMock,
      getToken: () => Promise.resolve('secret-token'),
    });

    await client.getHealth();

    expect(requestFrom(fetchMock).headers.get('Authorization')).toBe('Bearer secret-token');
  });

  it('throws an ApiError with the status and body when the response is not ok', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({ message: 'Service Unavailable' }, 503),
    );
    const client = createApiClient({ baseUrl: '/api', fetch: fetchMock });

    const error = await client.getHealth().catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 503, body: { message: 'Service Unavailable' } });
  });
});
