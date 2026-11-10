import { createApiClient } from '@csl/api-client';

const DEV_ACTOR = process.env.DEV_ACTOR ?? 'agent:5eed0000-0000-4000-8000-0000000000a1';

export const serverApi = createApiClient({
  baseUrl: process.env.API_URL ?? 'http://localhost:3000',
  fetch: (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set('x-dev-actor', DEV_ACTOR);

    return fetch(input, { ...init, headers });
  },
});