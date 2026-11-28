'use client';

import { useTranslations } from 'next-intl';

import { isCallActive } from '../lib/call/call-state';
import { useMediationCall } from '../lib/call/useMediationCall';

import { CallConnectionStatus } from './CallConnectionStatus';
import { CallParticipantsPanel } from './CallParticipantsPanel';
import styles from './MediationCall.module.css';
import { MicrophoneHelp } from './MicrophoneHelp';

import type { UseMediationCallOptions } from '../lib/call/useMediationCall';
import type { Incident } from '@csl/shared-types';

interface MediationCallProps extends UseMediationCallOptions {
  incidentId: Incident['id'];
  customerName: string;
  driverName: string | null;
}

export function MediationCall({
  incidentId,
  customerName,
  driverName,
  ...options
}: Readonly<MediationCallProps>) {
  const t = useTranslations('mediation.call');
  const { call, participants, join } = useMediationCall(incidentId, options);
  const active = isCallActive(call.status);
  const microphoneDenied = call.status === 'failed' && call.failure === 'microphone_denied';
  const label = {
    idle: t('join'),
    connecting: t('joining'),
    connected: t('inCall'),
    reconnecting: t('inCall'),
    ended: t('joinAgain'),
    failed: t('joinAgain'),
  }[call.status];

  return (
    <>
      <section className={styles.card} aria-labelledby="join-call-title">
        <h2 id="join-call-title" className={styles.cardTitle}>
          {t('title')}
        </h2>
        <p className={styles.intro}>{t('microphoneIntro')}</p>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.button}
            disabled={active}
            onClick={() => void join()}
          >
            {label}
          </button>
          <CallConnectionStatus call={call} />
        </div>
        {microphoneDenied && <MicrophoneHelp />}
      </section>

      <CallParticipantsPanel
        state={participants}
        customerName={customerName}
        driverName={driverName}
      />
    </>
  );
}
