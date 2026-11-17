export const DEFAULT_PATH = '/inbox';

const BASE = 'http://crm.invalid';

function isInternalPath(path: string): boolean {
  return path.startsWith('/') && !path.startsWith('//') && !path.startsWith('/\\');
}

export function safeNextPath(next: string | null | undefined): string {
  if (!next || !isInternalPath(next)) {
    return DEFAULT_PATH;
  }

  const url = new URL(next, BASE);
  const path = `${url.pathname}${url.search}${url.hash}`;

  return url.origin === BASE && isInternalPath(url.pathname) ? path : DEFAULT_PATH;
}
