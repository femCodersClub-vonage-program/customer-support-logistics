export const DEFAULT_PATH = '/orders';

function isInternalPath(path: string): boolean {
  return path.startsWith('/') && !path.startsWith('//') && !path.startsWith('/\\');
}

export function safeNextPath(next: string | null): string {
  if (next === null || !isInternalPath(next)) {
    return DEFAULT_PATH;
  }

  const { origin } = window.location;
  const url = new URL(next, origin);

  return url.origin === origin && isInternalPath(url.pathname)
    ? `${url.pathname}${url.search}${url.hash}`
    : DEFAULT_PATH;
}
