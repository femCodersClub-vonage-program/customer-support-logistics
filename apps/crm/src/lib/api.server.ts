import { createApiClient } from '@csl/api-client';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { API_URL } from './api-config';
import { CURRENT_PATH_HEADER, SESSION_EXPIRED_PATH } from './session';

async function sessionExpiredPath(): Promise<string> {
  const current = (await headers()).get(CURRENT_PATH_HEADER);

  return current
    ? `${SESSION_EXPIRED_PATH}?next=${encodeURIComponent(current)}`
    : SESSION_EXPIRED_PATH;
}

export const serverApi = createApiClient({
  baseUrl: API_URL,
  fetch: async (input, init) => {
    const requestHeaders = new Headers(init?.headers);
    const incoming = (await cookies()).toString();

    if (incoming !== '') {
      requestHeaders.set('cookie', incoming);
    }

    const response = await fetch(input, { ...init, headers: requestHeaders });

    if (response.status === 401) {
      redirect(await sessionExpiredPath());
    }

    return response;
  },
});

export async function currentAgentId(): Promise<string> {
  return (await serverApi.getCurrentUser()).id;
}
