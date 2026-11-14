import { createContext, use, useEffect } from 'react';

export type InterruptionsContextValue = {
  blocked: boolean;
  block: () => () => void;
};

export const InterruptionsContext = createContext<InterruptionsContextValue>({
  blocked: false,
  block: () => () => {},
});

export function useBlockInterruptions(active = true) {
  const { block } = use(InterruptionsContext);

  useEffect(() => {
    if (!active) {
      return;
    }

    return block();
  }, [active, block]);
}

export function useInterruptionsBlocked() {
  return use(InterruptionsContext).blocked;
}
