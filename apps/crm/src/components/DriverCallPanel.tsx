'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';

import { callDriverAgain, startMediation } from '../app/incidents/[id]/mediation/actions';
import { IDLE_STATE } from '../lib/mediation';

import { MediationError } from './MediationError';
import styles from './MediationPanel.module.css';

import type { Communication, Incident } from '@csl/shared-types';

interface DriverCallPanelProps {
  incidentId: Incident['id'];
  status: Incident['status'];
  hasDriver: boolean;
  call: Communication | undefined;
}

export function DriverCallPanel({ incidentId, status, hasDriver, call }: DriverCallPanelProps) {
  const t = useTranslations('mediation.driverCall');
  const [state, action, pending] = useActionState(
    () => (status === 'notified' ? startMediation(incidentId) : callDriverAgain(incidentId)),
    IDLE_STATE,
  );
  const canCall = hasDriver && (status === 'notified' || status === 'in_mediation');

  return (
    <section className={styles.card} aria-labelledby="driver-call-title">
      <h2 id="driver-call-title" className={styles.title}>
        {t('title')}
      </h2>

      <p className={styles.callStatus}>
        <span>{t('status')}</span>
        <strong data-status={call?.status}>
          {call === undefined ? t('noCall') : t(`callStatus.${call.status}`)}
        </strong>
      </p>

      {!hasDriver && <p>{t('noDriver')}</p>}
      {hasDriver && status === 'open' && <p>{t('notifyFirst')}</p>}

      {canCall && (
        <form action={action}>
          <button
            type="submit"
            className={styles.button}
            disabled={pending || (status === 'in_mediation' && call?.status === 'in_progress')}
          >
            {pending ? t('pending') : t(status === 'notified' ? 'start' : 'callAgain')}
          </button>
        </form>
      )}

      <MediationError error={state.error} />
    </section>
  );
}
