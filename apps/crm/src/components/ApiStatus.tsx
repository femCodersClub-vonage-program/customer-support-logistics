'use client';

import { ApiError } from '@csl/api-client';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { api } from '../lib/api';

import type { HealthResponse } from '@csl/shared-types';

type HealthError =
  { kind: 'http'; status: number } | { kind: 'message'; message: string } | { kind: 'unknown' };

type HealthState =
  | { kind: 'loading' }
  | { kind: 'ok'; health: HealthResponse }
  | { kind: 'error'; error: HealthError };

function toHealthError(error: unknown): HealthError {
  if (error instanceof ApiError) {
    return { kind: 'http', status: error.status };
  }

  return error instanceof Error ? { kind: 'message', message: error.message } : { kind: 'unknown' };
}

export function ApiStatus() {
  const t = useTranslations('apiStatus');
  const [state, setState] = useState<HealthState>({ kind: 'loading' });

  useEffect(() => {
    const controller = new AbortController();

    api
      .getHealth({ signal: controller.signal })
      .then((health) => setState({ kind: 'ok', health }))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setState({ kind: 'error', error: toHealthError(error) });
        }
      });

    return () => controller.abort();
  }, []);

  function describeError(error: HealthError) {
    if (error.kind === 'http') {
      return t('httpError', { status: error.status });
    }

    return error.kind === 'message' ? error.message : t('unknownError');
  }

  return (
    <section aria-labelledby="api-status-heading">
      <h2 id="api-status-heading">{t('title')}</h2>
      <p role="status">
        {state.kind === 'loading' && t('checking')}
        {state.kind === 'ok' && t('online', { version: state.health.version })}
        {state.kind === 'error' && t('unreachable', { reason: describeError(state.error) })}
      </p>
    </section>
  );
}
