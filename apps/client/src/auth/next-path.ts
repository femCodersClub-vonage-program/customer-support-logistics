export const DEFAULT_PATH = '/orders';

export function safeNextPath(next: string | null): string {
  if (next === null || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) {
    return DEFAULT_PATH;
  }

  return next;
}
