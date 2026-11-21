import { afterEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

const fetchMock = vi.fn();

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

function call(headers: Record<string, string> = {}) {
  vi.stubGlobal('fetch', fetchMock);

  return GET(new Request('http://crm.test/api/events/stream', { headers }));
}

describe('GET /api/events/stream', () => {
  it('forwards the session cookie and Last-Event-ID and streams the body', async () => {
    fetchMock.mockResolvedValue(new Response('data: {}\n\n', { status: 200 }));

    const response = await call({ cookie: 'sid=1', 'last-event-id': '7' });
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const sent = new Headers(init.headers);

    expect(url.pathname).toBe('/events/stream');
    expect(sent.get('cookie')).toBe('sid=1');
    expect(sent.get('last-event-id')).toBe('7');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(response.headers.get('content-type')).toBe('text/event-stream');
    expect(await response.text()).toBe('data: {}\n\n');
  });

  it('passes the upstream status through (for example 401)', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));

    expect((await call()).status).toBe(401);
  });

  it('answers 502 when the API is unreachable', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    expect((await call()).status).toBe(502);
  });
});
