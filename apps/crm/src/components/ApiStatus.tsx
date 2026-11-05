'use client';

import { ApiError } from '@csl/api-client';
import { useEffect, useState } from 'react';

import { api } from '../lib/api';

import type { HealthResponse } from '@csl/shared-types';

type HealthState =
  { kind: 'loading' } | { kind: 'ok'; health: HealthResponse } | { kind: 'error'; message: string };

function describeError(error: unknown) {
  if (error instanceof ApiError) {
    return `HTTP ${error.status}`;
  }

  return error instanceof Error ? error.message : 'Unknown error';
}

export function ApiStatus() {
  const [state, setState] = useState<HealthState>({ kind: 'loading' });

  useEffect(() => {
    const controller = new AbortController();

    api
      .getHealth({ signal: controller.signal })
      .then((health) => setState({ kind: 'ok', health }))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setState({ kind: 'error', message: describeError(error) });
        }
      });

    return () => controller.abort();
  }, []);

  return (
    <section aria-labelledby="api-status-heading">
      <h2 id="api-status-heading">API status</h2>
      <p role="status">
        {state.kind === 'loading' && 'Checking…'}
        {state.kind === 'ok' && `Online (version ${state.health.version})`}
        {state.kind === 'error' && `Unreachable: ${state.message}`}
      </p>
    </section>
  );
}
