export const DEFAULT_PATH = '/inbox';

const BASE = 'http://crm.invalid';

export function safeNextPath(next: string | null | undefined): string {
  if (!next?.startsWith('/')) {
    return DEFAULT_PATH;
  }

  const url = new URL(next, BASE);

  return url.origin === BASE ? `${url.pathname}${url.search}${url.hash}` : DEFAULT_PATH;
}
