import { useCallback, useMemo, useState } from 'react';

import { InterruptionsContext } from './interruptions.ts';

import type { ReactNode } from 'react';

export function InterruptionsProvider({ children }: { children: ReactNode }) {
  const [blockers, setBlockers] = useState(0);

  const block = useCallback(() => {
    setBlockers((count) => count + 1);

    return () => setBlockers((count) => count - 1);
  }, []);

  const value = useMemo(() => ({ blocked: blockers > 0, block }), [blockers, block]);

  return <InterruptionsContext value={value}>{children}</InterruptionsContext>;
}
