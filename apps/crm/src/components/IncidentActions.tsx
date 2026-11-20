'use client';

import { ApiError } from '@csl/api-client';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { api } from '../lib/api';

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
    <section aria-labelledby="incident-actions-heading">
      <h2 id="incident-actions-heading">{t('title')}</h2>

      {!assignedToMe && (
        <button type="button" onClick={assignToMe} disabled={loading}>
          {t('assign')}
        </button>
      )}

      {assignedToMe && <p>{t('assigned')}</p>}

      {status === 'open' && hasDriver && (
        <button type="button" onClick={() => setPendingAction('notify')} disabled={loading}>
          {t('notify')}
        </button>
      )}

      {status === 'notified' && hasDriver && (
        <button
          type="button"
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
        <button type="button" onClick={() => setPendingAction('mediation')} disabled={loading}>
          {t('mediation')}
        </button>
      )}

      {(status === 'open' || status === 'notified' || status === 'in_mediation') && (
        <button type="button" onClick={() => setPendingAction('escalate')} disabled={loading}>
          {t('escalate')}
        </button>
      )}

      {(status === 'in_mediation' || status === 'escalated') && (
        <button type="button" onClick={() => setPendingAction('resolve')} disabled={loading}>
          {t('resolve')}
        </button>
      )}

      {needsSmsConfirmation && (
        <div>
          <p>{pendingAction === 'notify' ? t('confirmNotify') : t('confirmNotifyAgain')}</p>

          <button type="button" onClick={executeAction} disabled={loading}>
            {loading ? t('sending') : t('submit')}
          </button>

          <button
            type="button"
            onClick={() => {
              setPendingAction(null);
              setNotifyAgainIdempotencyKey(null);
            }}
            disabled={loading}
          >
            {t('cancel')}
          </button>
        </div>
      )}

      {needsReason && (
        <div>
          <label htmlFor="incident-action-reason">
            {pendingAction === 'resolve' ? t('resolution') : t('escalationReason')}
          </label>

          <textarea
            id="incident-action-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            required
            maxLength={1000}
          />

          <button type="button" onClick={executeAction} disabled={loading || !reason.trim()}>
            {loading ? t('sending') : t('submit')}
          </button>

          <button
            type="button"
            onClick={() => {
              setPendingAction(null);
              setReason('');
            }}
            disabled={loading}
          >
            {t('cancel')}
          </button>
        </div>
      )}

      {pendingAction === 'mediation' && (
        <div>
          <p>{t('mediation')}</p>

          <button type="button" onClick={executeAction} disabled={loading}>
            {loading ? t('sending') : t('submit')}
          </button>

          <button
            type="button"
            onClick={() => {
              setPendingAction(null);
              setNotifyAgainIdempotencyKey(null);
            }}
            disabled={loading}
          >
            {t('cancel')}
          </button>
        </div>
      )}

      {success && <p role="status">{t('success')}</p>}
      {error && <p role="alert">{t('error')}</p>}
    </section>
  );
}
