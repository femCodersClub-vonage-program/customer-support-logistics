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
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ status: 'ok', version: '1.2.3' }));
    const client = createApiClient({ baseUrl: '/api/', fetch: fetchMock });

    await expect(client.getHealth()).resolves.toEqual({ status: 'ok', version: '1.2.3' });

    const { url, headers } = requestFrom(fetchMock);

    expect(url).toBe('/api/health');
    expect(headers.get('Accept')).toBe('application/json');
    expect(headers.has('Authorization')).toBe(false);
  });

  it('sends the bearer token when a token provider returns one', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ status: 'ok', version: '1.2.3' }));
    const client = createApiClient({
      baseUrl: '/api',
      fetch: fetchMock,
      getToken: () => Promise.resolve('secret-token'),
    });

    await client.getHealth();

    expect(requestFrom(fetchMock).headers.get('Authorization')).toBe('Bearer secret-token');
  });

  it('throws an ApiError with the status and body when the response is not ok', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ message: 'Service Unavailable' }, 503));
    const client = createApiClient({ baseUrl: '/api', fetch: fetchMock });

    const error = await client.getHealth().catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 503, body: { message: 'Service Unavailable' } });
  });
});

describe('listIncidents', () => {
  const emptyPage = { items: [], total: 0, limit: 20, offset: 0 };

  it('repeats array params in the query string', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(emptyPage));
    const client = createApiClient({ baseUrl: '/api', fetch: fetchMock });

    await client.listIncidents({ status: ['open', 'notified'], q: 'ana', order: 'asc' });

    expect(requestFrom(fetchMock).url).toBe(
      '/api/incidents?status=open&status=notified&q=ana&order=asc',
    );
  });

  it('omits undefined values and the "?" when there is no query', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(emptyPage));
    const client = createApiClient({ baseUrl: '/api', fetch: fetchMock });

    await client.listIncidents({ type: undefined });

    expect(requestFrom(fetchMock).url).toBe('/api/incidents');
  });
});

describe('incidents', () => {
  const incidentId = '6f1e2d3c-4b5a-4987-8a6b-5c4d3e2f1a0b';
  const incident = { id: incidentId, status: 'open' };

  it('gets an incident detail using an encoded ID', async () => {
    const detail = { ...incident, events: [], communications: [] };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(detail));
    const client = createApiClient({ baseUrl: '/api', fetch: fetchMock });

    await expect(client.getIncident('incident/123')).resolves.toEqual(detail);

    expect(requestFrom(fetchMock).url).toBe('/api/incidents/incident%2F123');
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('GET');
  });

  it('assigns an incident to the current agent', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(incident));
    const client = createApiClient({ baseUrl: '/api', fetch: fetchMock });

    await client.assignIncidentToMe(incidentId);

    expect(requestFrom(fetchMock).url).toBe(`/api/incidents/${incidentId}/assign-to-me`);
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('POST');
  });

  it('notifies the driver', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(incident));
    const client = createApiClient({ baseUrl: '/api', fetch: fetchMock });

    await client.notifyDriver(incidentId);

    expect(requestFrom(fetchMock).url).toBe(`/api/incidents/${incidentId}/notify-driver`);
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('POST');
  });

  it('resends a driver notification with an idempotency key', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(incident));
    const client = createApiClient({ baseUrl: '/api', fetch: fetchMock });

    await client.notifyDriverAgain(incidentId, 'retry-key-123');

    const { url, headers } = requestFrom(fetchMock);
    expect(url).toBe(`/api/incidents/${incidentId}/notify-driver/again`);
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('POST');
    expect(headers.get('Idempotency-Key')).toBe('retry-key-123');
  });

  it('changes the incident status to resolved with a JSON body', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(incident));
    const client = createApiClient({ baseUrl: '/api', fetch: fetchMock });

    const body = { status: 'resolved' as const, reason: 'resolved: ok' };

    await client.changeIncidentStatus(incidentId, body);

    const { url, headers } = requestFrom(fetchMock);
    expect(url).toBe(`/api/incidents/${incidentId}/status`);
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('PATCH');
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(JSON.stringify(body));
  });
  it('changes the incident status with a JSON body', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(incident));
    const client = createApiClient({ baseUrl: '/api', fetch: fetchMock });
    const body = {
      status: 'in_mediation' as const,
      reason: 'The agent contacted the customer',
    };

    await client.changeIncidentStatus(incidentId, body);

    const { url, headers } = requestFrom(fetchMock);
    expect(url).toBe(`/api/incidents/${incidentId}/status`);
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('PATCH');
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(JSON.stringify(body));
  });
});

describe('incident action API errors', () => {
  it('preserves an HTTP 409 error when resending a driver notification', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ message: 'Conflict' }, 409));
    const client = createApiClient({ baseUrl: '/api', fetch: fetchMock });

    const error = await client
      .notifyDriverAgain('incident-123', 'retry-key-123')
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 409,
      body: { message: 'Conflict' },
    });
  });
});

describe('mediation', () => {
  const incidentId = '6f1e2d3c-4b5a-4987-8a6b-5c4d3e2f1a0b';

  it.each([
    ['startMediation', `/api/incidents/${incidentId}/mediation`],
    ['callDriver', `/api/incidents/${incidentId}/mediation/driver-call`],
  ] as const)('%s posts to %s', async (method, expectedUrl) => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({}, 201));
    const client = createApiClient({ baseUrl: '/api', fetch: fetchMock });

    await client[method](incidentId);

    const [url, init] = fetchMock.mock.calls[0] ?? [];

    expect(url).toBe(expectedUrl);
    expect(init?.method).toBe('POST');
  });
});

describe('timeout', () => {
  const neverAnswers = () =>
    vi.fn<typeof fetch>(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          const signal = init?.signal;

          if (signal?.aborted) {
            reject(signal.reason);
          }

          signal?.addEventListener('abort', () => reject(signal.reason));
        }),
    );

  it('aborts a request that takes longer than the timeout', async () => {
    const fetchMock = neverAnswers();
    const client = createApiClient({ baseUrl: '/api', fetch: fetchMock, timeoutMs: 10 });

    await expect(client.getHealth()).rejects.toMatchObject({ name: 'TimeoutError' });
  });

  it('still honours the caller signal', async () => {
    const fetchMock = neverAnswers();
    const client = createApiClient({ baseUrl: '/api', fetch: fetchMock });
    const controller = new AbortController();

    const request = client.getHealth({ signal: controller.signal });
    controller.abort();

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('ApiError', () => {
  it('exposes the error code of the API error body', () => {
    expect(new ApiError('x', 401, { error: { code: 'INVALID_CODE', message: 'No' } }).code).toBe(
      'INVALID_CODE',
    );
  });

  it('has no code when the body is not an API error', () => {
    expect(new ApiError('x', 502, 'Bad Gateway').code).toBeUndefined();
    expect(new ApiError('x', 500, { message: 'No' }).code).toBeUndefined();
  });
});

describe('auth', () => {
  const user = { role: 'customer', id: '6f1e2d3c-4b5a-4987-8a6b-5c4d3e2f1a0b', name: 'Ana' };

  it('gets the current user', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(user));
    const client = createApiClient({ baseUrl: '/api', fetch: fetchMock });

    await expect(client.getCurrentUser()).resolves.toEqual(user);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/auth/me');
  });

  it.each([
    ['startCustomerLogin', '/api/auth/customer/start', { phone: '+34600000001' }],
    ['checkCustomerLogin', '/api/auth/customer/check', { code: '123456' }],
    ['agentLogin', '/api/auth/agent/login', { email: 'a@example.com', password: 'secret' }],
  ] as const)('%s posts a JSON body to %s', async (method, expectedUrl, body) => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({}));
    const client = createApiClient({ baseUrl: '/api', fetch: fetchMock });

    await (client[method] as (value: typeof body) => Promise<unknown>)(body);

    const [url, init] = fetchMock.mock.calls[0] ?? [];

    expect(url).toBe(expectedUrl);
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json');
    expect(init?.body).toBe(JSON.stringify(body));
  });

  it.each([
    ['moveCustomerLoginToSms', '/api/auth/customer/sms'],
    ['logout', '/api/auth/logout'],
  ] as const)('%s posts to %s and resolves with nothing on 204', async (method, expectedUrl) => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    const client = createApiClient({ baseUrl: '/api', fetch: fetchMock });

    await expect(client[method]()).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[0]?.[0]).toBe(expectedUrl);
  });
});
