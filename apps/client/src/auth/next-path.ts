export const DEFAULT_PATH = '/orders';

export function safeNextPath(next: string | null): string {
  if (next === null || !next.startsWith('/')) {
    return DEFAULT_PATH;
  }

  const { origin } = window.location;
  const url = new URL(next, origin);

  return url.origin === origin ? `${url.pathname}${url.search}${url.hash}` : DEFAULT_PATH;
}
