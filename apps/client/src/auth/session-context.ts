import { createContext, use } from 'react';

import type { CurrentUser } from '@csl/contracts';

export type SessionState = { status: 'loading' } | { status: 'ready'; user: CurrentUser | null };

export interface Session {
  state: SessionState;
  logIn: (user: CurrentUser) => void;
  logOut: () => Promise<void>;
}

export const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const session = use(SessionContext);

  if (session === null) {
    throw new Error('useSession needs a SessionProvider');
  }

  return session;
}
