'use client';

import { ApiError } from '@csl/api-client';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { api } from '../lib/api';

import styles from './IncidentActions.module.css';

import type { IncidentStatus } from '@csl/shared-types';

interface IncidentActionsProps {
  incidentId: string;
  status: IncidentStatus;
  agentId: string | null;
  currentAgentId: string;
  hasDriver: boolean;
}

type PendingAction = 'notify' | 'notifyAgain' | 'mediation' | 'resolve' | 'escalate' | null;

export function IncidentActions({
  incidentId,
  status,
  agentId,
  currentAgentId,
  hasDriver,
}: IncidentActionsProps) {
  const t = useTranslations('incident.actions');
  const router = useRouter();

  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [notifyAgainIdempotencyKey, setNotifyAgainIdempotencyKey] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(false);

  const assignedToMe = agentId === currentAgentId;

  async function executeAction() {
    if (!pendingAction || loading) {
      return;
    }

    if ((pendingAction === 'resolve' || pendingAction === 'escalate') && !reason.trim()) {
      return;
    }

    setLoading(true);
    setSuccess(false);
    setError(false);

    try {
      switch (pendingAction) {
        case 'notify':
          await api.notifyDriver(incidentId);
          break;

        case 'notifyAgain':
          await api.notifyDriverAgain(incidentId, notifyAgainIdempotencyKey!);
          break;

        case 'mediation':
          await api.changeIncidentStatus(incidentId, {
            status: 'in_mediation',
          });
          break;

        case 'resolve':
          await api.changeIncidentStatus(incidentId, {
            status: 'resolved',
            reason: reason.trim(),
          });
          break;

        case 'escalate':
          await api.changeIncidentStatus(incidentId, {
            status: 'escalated',
            reason: reason.trim(),
          });
          break;
      }

      setPendingAction(null);
      setReason('');
      setSuccess(true);
      router.refresh();
    } catch (cause) {
      setError(true);

      if (cause instanceof ApiError) {
        console.error('Incident action failed:', cause.status);
      }
    } finally {
      setLoading(false);
    }
  }

  async function assignToMe() {
    if (loading || assignedToMe) {
      return;
    }

    setLoading(true);
    setSuccess(false);
    setError(false);

    try {
      await api.assignIncidentToMe(incidentId);
      setSuccess(true);
      router.refresh();
    } catch (cause) {
      setError(true);

      if (cause instanceof ApiError) {
        console.error('Incident assignment failed:', cause.status);
      }
    } finally {
      setLoading(false);
    }
  }

  const needsReason = pendingAction === 'resolve' || pendingAction === 'escalate';

  const needsSmsConfirmation = pendingAction === 'notify' || pendingAction === 'notifyAgain';

  return (
    <section className={styles.card} aria-labelledby="incident-actions-heading">
      <h2 id="incident-actions-heading" className={styles.title}>
        {t('title')}
      </h2>

      {assignedToMe && <p className={styles.assigned}>{t('assigned')}</p>}

      <div className={styles.bar}>
        {!assignedToMe && (
          <button type="button" className={styles.button} onClick={assignToMe} disabled={loading}>
            {t('assign')}
          </button>
        )}

        {status === 'open' && hasDriver && (
          <button
            type="button"
            className={`${styles.button} ${styles.primary}`}
            onClick={() => setPendingAction('notify')}
            disabled={loading}
          >
            {t('notify')}
          </button>
        )}

        {status === 'notified' && hasDriver && (
          <button
            type="button"
            className={styles.button}
            onClick={() => {
              setNotifyAgainIdempotencyKey(globalThis.crypto.randomUUID());
              setPendingAction('notifyAgain');
            }}
            disabled={loading}
          >
            {t('notifyAgain')}
          </button>
        )}

        {status === 'notified' && (
          <button
            type="button"
            className={`${styles.button} ${styles.primary}`}
            onClick={() => setPendingAction('mediation')}
            disabled={loading}
          >
            {t('mediation')}
          </button>
        )}

        {(status === 'notified' || status === 'in_mediation' || status === 'escalated') && (
          <button
            type="button"
            className={`${styles.button} ${styles.primary}`}
            onClick={() => setPendingAction('resolve')}
            disabled={loading}
          >
            {t('resolve')}
          </button>
        )}

        {(status === 'open' || status === 'notified' || status === 'in_mediation') && (
          <button
            type="button"
            className={`${styles.button} ${styles.danger}`}
            onClick={() => setPendingAction('escalate')}
            disabled={loading}
          >
            {t('escalate')}
          </button>
        )}
      </div>

      {needsSmsConfirmation && (
        <div className={styles.panel}>
          <p>{pendingAction === 'notify' ? t('confirmNotify') : t('confirmNotifyAgain')}</p>

          <div className={styles.panelActions}>
            <button
              type="button"
              className={`${styles.button} ${styles.primary}`}
              onClick={executeAction}
              disabled={loading}
            >
              {loading ? t('sending') : t('submit')}
            </button>

            <button
              type="button"
              className={styles.button}
              onClick={() => {
                setPendingAction(null);
                setNotifyAgainIdempotencyKey(null);
              }}
              disabled={loading}
            >
              {t('cancel')}
            </button>
          </div>
        </div>
      )}

      {needsReason && (
        <div className={styles.panel}>
          <label htmlFor="incident-action-reason">
            {pendingAction === 'resolve' ? t('resolution') : t('escalationReason')}
          </label>

          <textarea
            id="incident-action-reason"
            className={styles.textarea}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            required
            maxLength={1000}
          />

          <div className={styles.panelActions}>
            <button
              type="button"
              className={`${styles.button} ${styles.primary}`}
              onClick={executeAction}
              disabled={loading || !reason.trim()}
            >
              {loading ? t('sending') : t('submit')}
            </button>

            <button
              type="button"
              className={styles.button}
              onClick={() => {
                setPendingAction(null);
                setReason('');
              }}
              disabled={loading}
            >
              {t('cancel')}
            </button>
          </div>
        </div>
      )}

      {pendingAction === 'mediation' && (
        <div className={styles.panel}>
          <p>{t('mediation')}</p>

          <div className={styles.panelActions}>
            <button
              type="button"
              className={`${styles.button} ${styles.primary}`}
              onClick={executeAction}
              disabled={loading}
            >
              {loading ? t('sending') : t('submit')}
            </button>

            <button
              type="button"
              className={styles.button}
              onClick={() => {
                setPendingAction(null);
                setNotifyAgainIdempotencyKey(null);
              }}
              disabled={loading}
            >
              {t('cancel')}
            </button>
          </div>
        </div>
      )}

      {success && (
        <p role="status" className={styles.success}>
          {t('success')}
        </p>
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {t('error')}
        </p>
      )}
    </section>
  );
}
