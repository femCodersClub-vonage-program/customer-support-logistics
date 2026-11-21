const API_URL = process.env.API_URL ?? 'http://localhost:3000';

export async function GET(request: Request) {
  const headers = new Headers({ accept: 'text/event-stream' });
  const cookie = request.headers.get('cookie');
  const lastEventId = request.headers.get('last-event-id');

  if (cookie) {
    headers.set('cookie', cookie);
  }

  if (lastEventId) {
    headers.set('last-event-id', lastEventId);
  }

  let upstream: Response;

  try {
    upstream = await fetch(new URL('/events/stream', API_URL), {
      headers,
      cache: 'no-store',
      signal: request.signal,
    });
  } catch {
    return new Response(null, { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    return new Response(null, { status: upstream.status });
  }

  return new Response(upstream.body, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
    },
  });
}
