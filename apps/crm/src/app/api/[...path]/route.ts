import type { NextRequest } from 'next/server';

const API_URL = process.env.API_URL ?? 'http://localhost:3000';

const REQUEST_HEADERS = [
  'accept',
  'authorization',
  'content-type',
  'cookie',
  'idempotency-key',
] as const;

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'content-encoding',
  'content-length',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

async function proxyRequest(request: NextRequest): Promise<Response> {
  const apiPath = request.nextUrl.pathname.replace(/^\/api/, '');
  const targetUrl = new URL(`${apiPath}${request.nextUrl.search}`, API_URL);

  const headers = new Headers();

  for (const name of REQUEST_HEADERS) {
    const value = request.headers.get(name);

    if (value) {
      headers.set(name, value);
    }
  }

  const init: RequestInit = {
    method: request.method,
    headers,
    cache: 'no-store',
  };

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.arrayBuffer();
  }

  const apiResponse = await fetch(targetUrl, init);
  const responseHeaders = new Headers();

  for (const [name, value] of apiResponse.headers) {
    if (name !== 'set-cookie' && !HOP_BY_HOP_HEADERS.has(name)) {
      responseHeaders.set(name, value);
    }
  }

  for (const cookie of apiResponse.headers.getSetCookie()) {
    responseHeaders.append('set-cookie', cookie);
  }

  return new Response(await apiResponse.arrayBuffer(), {
    status: apiResponse.status,
    headers: responseHeaders,
  });
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PATCH = proxyRequest;
