'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import {
  endMediationCall,
  removeMediationParticipant,
} from '../app/incidents/[id]/mediation/actions';
import { isCallActive } from '../lib/call/call-state';
import { useMediationCall } from '../lib/call/useMediationCall';

import { CallConnectionStatus } from './CallConnectionStatus';
import { CallControls } from './CallControls';
import { CallParticipantsPanel } from './CallParticipantsPanel';
import { ConfirmDialog } from './ConfirmDialog';
import styles from './MediationCall.module.css';
import { MediationError } from './MediationError';
import { MicrophoneHelp } from './MicrophoneHelp';

import type { RemovableRole } from './CallParticipantsPanel';
import type { UseMediationCallOptions } from '../lib/call/useMediationCall';
import type { MediationError as MediationErrorCode } from '../lib/mediation';
import type { Incident } from '@csl/shared-types';

interface MediationCallProps extends UseMediationCallOptions {
  incidentId: Incident['id'];
  customerName: string;
  driverName: string | null;
}

type Confirmation = { kind: 'end' } | { kind: 'remove'; role: RemovableRole };

export function MediationCall({
  incidentId,
  customerName,
  driverName,
  ...options
}: Readonly<MediationCallProps>) {
  const t = useTranslations('mediation.call');
  const { call, participants, join, leave, toggleMute } = useMediationCall(incidentId, options);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [error, setError] = useState<MediationErrorCode | null>(null);
  const [pending, startTransition] = useTransition();
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
  const names: Record<RemovableRole, string> = {
    customer: customerName,
    driver: driverName ?? t('participants.noDriver'),
  };

  function confirm() {
    if (confirmation === null) {
      return;
    }

    startTransition(async () => {
      const result =
        confirmation.kind === 'end'
          ? await endMediationCall(incidentId)
          : await removeMediationParticipant(incidentId, confirmation.role);

      setError(result.error);

      if (result.error === null) {
        setConfirmation(null);

        if (confirmation.kind === 'end') {
          // The API hangs up every leg. Close this browser's side too, without waiting for the event.
          await leave();
        }
      }
    });
  }

  function cancel() {
    setConfirmation(null);
    setError(null);
  }

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
        <CallControls
          call={call}
          onToggleMute={() => void toggleMute()}
          onLeave={() => void leave()}
          onEndForAll={() => {
            setError(null);
            setConfirmation({ kind: 'end' });
          }}
        />
        {confirmation === null && <MediationError error={error} />}
      </section>

      <CallParticipantsPanel
        state={participants}
        customerName={customerName}
        driverName={driverName}
        onRemove={(role) => {
          setError(null);
          setConfirmation({ kind: 'remove', role });
        }}
      />

      {confirmation !== null && (
        <ConfirmDialog
          title={
            confirmation.kind === 'end'
              ? t('confirm.endForAll.title')
              : t('confirm.remove.title', { name: names[confirmation.role] })
          }
          confirmLabel={
            confirmation.kind === 'end'
              ? t('confirm.endForAll.confirm')
              : t('confirm.remove.confirm')
          }
          cancelLabel={t('confirm.cancel')}
          pending={pending}
          onConfirm={confirm}
          onCancel={cancel}
        >
          <p>
            {confirmation.kind === 'end'
              ? t('confirm.endForAll.body')
              : t('confirm.remove.body', { name: names[confirmation.role] })}
          </p>
          <MediationError error={error} />
        </ConfirmDialog>
      )}
    </>
  );
}
