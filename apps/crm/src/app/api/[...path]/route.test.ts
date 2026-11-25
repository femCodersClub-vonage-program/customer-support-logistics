import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('API route proxy', () => {
  it('forwards the session cookie and request headers without the legacy dev actor', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"ok":true}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const request = new NextRequest('http://crm.test/api/auth/agent/login?next=%2Finbox', {
      method: 'POST',
      headers: {
        cookie: 'csl_session=session-token',
        'content-type': 'application/json',
        'idempotency-key': 'request-123',
      },
      body: JSON.stringify({}),
    });

    await POST(request);

    expect(fetchMock).toHaveBeenCalledOnce();

    const fetchCall = fetchMock.mock.calls[0];
    if (!fetchCall) {
      throw new Error('Expected the API proxy to call fetch');
    }

    const [target, init] = fetchCall;
    const forwardedHeaders = new Headers(init?.headers);

    expect(String(target)).toBe('http://localhost:3000/auth/agent/login?next=%2Finbox');
    expect(forwardedHeaders.get('cookie')).toBe('csl_session=session-token');
    expect(forwardedHeaders.get('content-type')).toBe('application/json');
    expect(forwardedHeaders.get('idempotency-key')).toBe('request-123');
    expect(forwardedHeaders.has('x-dev-actor')).toBe(false);
    expect(init?.method).toBe('POST');
    expect(init?.body).toBeInstanceOf(ArrayBuffer);
  });

  it('forwards response headers and preserves multiple Set-Cookie values separately', async () => {
    const apiHeaders = new Headers({
      'content-type': 'application/json',
      'cache-control': 'no-store',
      location: '/inbox',
      connection: 'keep-alive',
    });
    apiHeaders.append('set-cookie', 'csl_session=session-token; Path=/; HttpOnly; Secure');
    apiHeaders.append('set-cookie', 'csl_verification=request-token; Path=/; HttpOnly; Secure');

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"ok":true}', {
        status: 200,
        headers: apiHeaders,
      }),
    );

    const response = await POST(
      new NextRequest('http://crm.test/api/auth/agent/login', {
        method: 'POST',
        body: '{}',
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('location')).toBe('/inbox');
    expect(response.headers.get('connection')).toBeNull();
    expect(response.headers.getSetCookie()).toEqual([
      'csl_session=session-token; Path=/; HttpOnly; Secure',
      'csl_verification=request-token; Path=/; HttpOnly; Secure',
    ]);
  });
});
