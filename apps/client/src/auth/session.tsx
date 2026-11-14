import { useCallback, useEffect, useMemo, useState } from 'react';

import { api } from '../api.ts';

import { SessionContext } from './session-context.ts';

import type { SessionState } from './session-context.ts';
import type { CurrentUser } from '@csl/contracts';
import type { ReactNode } from 'react';

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();

    api.getCurrentUser({ signal: controller.signal }).then(
      (user) => setState({ status: 'ready', user }),
      () => {
        if (!controller.signal.aborted) {
          setState({ status: 'ready', user: null });
        }
      },
    );

    return () => controller.abort();
  }, []);

  const logIn = useCallback((user: CurrentUser) => setState({ status: 'ready', user }), []);

  const logOut = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setState({ status: 'ready', user: null });
    }
  }, []);

  const session = useMemo(() => ({ state, logIn, logOut }), [state, logIn, logOut]);

  return <SessionContext value={session}>{children}</SessionContext>;
}
