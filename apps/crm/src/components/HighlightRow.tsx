'use client';

import { useSyncExternalStore } from 'react';

import { isHighlighted, subscribeHighlights } from '../lib/events/highlights';

import type { ReactNode } from 'react';

export function HighlightRow({
  incidentId,
  className,
  children,
}: Readonly<{ incidentId: string; className?: string; children: ReactNode }>) {
  const active = useSyncExternalStore(
    subscribeHighlights,
    () => isHighlighted(incidentId),
    () => false,
  );

  return (
    <tr className={className} data-highlight={active ? 'true' : undefined}>
      {children}
    </tr>
  );
}
