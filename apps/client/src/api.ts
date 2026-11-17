import { createApiClient } from '@csl/api-client';

export const api = createApiClient({ baseUrl: new URL('/api', window.location.origin).href });
