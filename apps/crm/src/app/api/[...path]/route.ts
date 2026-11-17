import type { NextRequest } from 'next/server';

const API_URL = process.env.API_URL ?? 'http://localhost:3000';
const CURRENT_AGENT_ID = process.env.DEV_AGENT_ID ?? '5eed0000-0000-4000-8000-0000000000a1';

async function proxyRequest(request: NextRequest): Promise<Response> {
  const apiPath = request.nextUrl.pathname.replace(/^\/api/, '');
  const targetUrl = new URL(`${apiPath}${request.nextUrl.search}`, API_URL);

  const headers = new Headers();

  for (const name of ['accept', 'authorization', 'content-type', 'idempotency-key']) {
    const value = request.headers.get(name);

    if (value) {
      headers.set(name, value);
    }
  }

  if (process.env.NODE_ENV === 'development') {
    headers.set('x-dev-actor', `agent:${CURRENT_AGENT_ID}`);
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
  const contentType = apiResponse.headers.get('content-type');

  if (contentType) {
    responseHeaders.set('content-type', contentType);
  }

  return new Response(await apiResponse.arrayBuffer(), {
    status: apiResponse.status,
    headers: responseHeaders,
  });
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PATCH = proxyRequest;
