const PENDING_LOGIN_KEY = 'csl.pendingLogin';

export interface PendingLogin {
  phone: string;
  next: string;
}

function isPendingLogin(value: unknown): value is PendingLogin {
  return (
    typeof value === 'object' &&
    value !== null &&
    'phone' in value &&
    typeof value.phone === 'string' &&
    'next' in value &&
    typeof value.next === 'string'
  );
}

export function savePendingLogin(login: PendingLogin): void {
  try {
    sessionStorage.setItem(PENDING_LOGIN_KEY, JSON.stringify(login));
  } catch {
    return;
  }
}

export function takePendingLogin(): PendingLogin | null {
  try {
    const raw = sessionStorage.getItem(PENDING_LOGIN_KEY);
    sessionStorage.removeItem(PENDING_LOGIN_KEY);
    const parsed: unknown = raw === null ? null : JSON.parse(raw);

    return isPendingLogin(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
