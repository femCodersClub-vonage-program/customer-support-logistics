import { createApiClient } from '@csl/api-client';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { SESSION_EXPIRED_PATH } from './session';

export const serverApi = createApiClient({
  baseUrl: process.env.API_URL ?? 'http://localhost:3000',
  fetch: async (input, init) => {
    const headers = new Headers(init?.headers);
    const incoming = (await cookies()).toString();

    if (incoming !== '') {
      headers.set('cookie', incoming);
    }

    const response = await fetch(input, { ...init, headers });

    if (response.status === 401) {
      redirect(SESSION_EXPIRED_PATH);
    }

    return response;
  },
});

export async function currentAgentId(): Promise<string> {
  return (await serverApi.getCurrentUser()).id;
}
