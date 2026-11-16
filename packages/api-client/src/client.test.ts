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

describe('incident detail and actions', () => {
  const incident = {
    id: 'incident-123',
    status: 'open',
  };

  it('gets an incident detail using an encoded ID', async () => {
    const detail = { ...incident, events: [], communications: [] };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(detail));
    const client = createApiClient({ baseUrl: '/api', fetch: fetchMock });

    await expect(client.getIncident('incident/123')).resolves.toEqual(detail);

    expect(requestFrom(fetchMock).url).toBe('/api/incidents/incident%2F123');
  });

  it('assigns an incident to the current agent', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(incident));
    const client = createApiClient({ baseUrl: '/api', fetch: fetchMock });

    await client.assignIncidentToMe('incident-123');

    expect(requestFrom(fetchMock).url).toBe('/api/incidents/incident-123/assign-to-me');
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('POST');
  });

  it('notifies the driver', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(incident));
    const client = createApiClient({ baseUrl: '/api', fetch: fetchMock });

    await client.notifyDriver('incident-123');

    expect(requestFrom(fetchMock).url).toBe('/api/incidents/incident-123/notify-driver');
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('POST');
  });

  it('resends a driver notification with an idempotency key', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(incident));
    const client = createApiClient({ baseUrl: '/api', fetch: fetchMock });

    await client.notifyDriverAgain('incident-123', 'retry-key-123');

    const { url, headers } = requestFrom(fetchMock);
    expect(url).toBe('/api/incidents/incident-123/notify-driver/again');
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('POST');
    expect(headers.get('Idempotency-Key')).toBe('retry-key-123');
  });

  it('changes the incident status with a JSON body', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(incident));
    const client = createApiClient({ baseUrl: '/api', fetch: fetchMock });

    await client.changeIncidentStatus('incident-123', {
      status: 'in_mediation',
      reason: 'The agent contacted the customer',
    });

    const { url, headers } = requestFrom(fetchMock);
    expect(url).toBe('/api/incidents/incident-123/status');
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('PATCH');
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(
      JSON.stringify({
        status: 'in_mediation',
        reason: 'The agent contacted the customer',
      }),
    );
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
