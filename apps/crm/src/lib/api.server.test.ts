import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { serverApi } from './api.server';

const redirect = vi.hoisted(() =>
  vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
);

vi.mock('next/navigation', () => ({ redirect }));
vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ toString: () => '' }),
}));

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('serverApi', () => {
  it('clears the dead session when the API answers 401', async () => {
    server.use(
      http.get('*/auth/me', () =>
        HttpResponse.json({ error: { code: 'UNAUTHORIZED', message: 'No' } }, { status: 401 }),
      ),
    );

    await expect(serverApi.getCurrentUser()).rejects.toThrow('redirect:/session-expired');
    expect(redirect).toHaveBeenCalledWith('/session-expired');
  });

  it('sends no cookie header when the request has no cookies', async () => {
    let cookie: string | null = 'unset';
    server.use(
      http.get('*/auth/me', ({ request }) => {
        cookie = request.headers.get('cookie');
        return HttpResponse.json({ role: 'agent', id: 'a1', name: 'Marta' });
      }),
    );

    await serverApi.getCurrentUser();

    expect(cookie).toBeNull();
  });
});
