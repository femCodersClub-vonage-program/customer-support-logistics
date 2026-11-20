import { ApiError } from '@csl/api-client';
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

    const load = () => {
      api.getCurrentUser({ signal: controller.signal }).then(
        (user) => setState({ status: 'ready', user }),
        (error: unknown) => {
          if (controller.signal.aborted) {
            return;
          }

          setState({ status: 'ready', user: null });

          if (!(error instanceof ApiError && error.status === 401)) {
            window.addEventListener('online', load, { once: true, signal: controller.signal });
          }
        },
      );
    };

    load();

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
