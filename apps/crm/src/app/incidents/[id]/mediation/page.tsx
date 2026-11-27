import { ApiError } from '@csl/api-client';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { DriverCallPanel } from '../../../../components/DriverCallPanel';
import { EvidenceGallery } from '../../../../components/EvidenceGallery';
import { IncidentSummary } from '../../../../components/IncidentSummary';
import { MediationOutcomeForm } from '../../../../components/MediationOutcomeForm';
import { StatusBadge } from '../../../../components/StatusBadge';
import { serverApi } from '../../../../lib/api.server';
import { latestDriverCall, latestDriverReply } from '../../../../lib/mediation';
import { shortId } from '../../../../lib/short-id';

import styles from './page.module.css';

import type { IncidentDetail } from '@csl/contracts';
import type { Incident } from '@csl/shared-types';

interface MediationPageProps {
  params: Promise<{ id: Incident['id'] }>;
}

const CLOSED_STATUSES: readonly Incident['status'][] = ['resolved', 'escalated'];

type StepState = 'done' | 'active' | 'pending';

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return '?';
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function driverConnectionSteps(incident: IncidentDetail) {
  const hasSms =
    incident.status !== 'open' ||
    incident.communications.some((c) => c.channel === 'sms' && c.direction === 'outbound');
  const driverCall = latestDriverCall(incident.communications);
  const driverReply = latestDriverReply(incident.events);
  const inMediationOrClosed =
    incident.status === 'in_mediation' ||
    incident.status === 'resolved' ||
    incident.status === 'escalated';

  const smsState: StepState = hasSms ? 'done' : 'pending';
  const callState: StepState =
    driverCall === undefined
      ? 'pending'
      : driverCall.status === 'in_progress' || driverCall.status === 'completed'
        ? 'done'
        : 'active';
  const replyState: StepState = driverReply !== undefined ? 'done' : 'pending';
  const mediationState: StepState =
    incident.status === 'in_mediation'
      ? 'active'
      : incident.status === 'resolved'
        ? 'done'
        : inMediationOrClosed
          ? 'done'
          : 'pending';

  return [
    { key: 'sms', state: smsState },
    { key: 'outboundCall', state: callState },
    { key: 'driverReply', state: replyState },
    { key: 'inMediation', state: mediationState },
  ] as const;
}

async function loadIncident(id: Incident['id']) {
  try {
    return await serverApi.getIncident(id);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) {
      notFound();
    }

    throw error;
  }
}

export default async function MediationPage({ params }: MediationPageProps) {
  const { id } = await params;
  const t = await getTranslations('mediation');
  const incident = await loadIncident(id);
  const evidence = await serverApi.listEvidence(id);
  const driverCall = latestDriverCall(incident.communications);
  const steps = driverConnectionSteps(incident);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <Link href="/inbox" className={styles.backLink}>
            ← {t('backToInbox')}
          </Link>
          <h1 className={styles.title}>{t('title')}</h1>
          <p className={styles.incidentRef}>{t('incident', { id: shortId(incident.id) })}</p>
          <StatusBadge status={incident.status} />
        </div>
        <div className={styles.headerRight}>
          <Link href={`/incidents/${incident.id}`} className={styles.backLink}>
            {t('viewIncident')}
          </Link>
        </div>
      </header>

      <div className={styles.layout}>
        <div className={styles.main}>
          <section className={styles.participants} aria-label={t('participants.title')}>
            <article
              className={
                incident.status === 'in_mediation'
                  ? `${styles.participantCard} ${styles.participantCardActive}`
                  : styles.participantCard
              }
            >
              <div className={styles.participantHeader}>
                <span className={styles.avatar} aria-hidden="true">
                  {initialsOf(incident.customer.name)}
                </span>
                <div className={styles.participantInfo}>
                  <p className={styles.participantName}>{incident.customer.name}</p>
                  <p className={styles.participantRole}>{t('participants.customerRole')}</p>
                </div>
              </div>
              <p className={styles.participantMeta}>
                <a href={`tel:${incident.customer.phone}`}>{incident.customer.phone}</a>
              </p>
            </article>

            <article className={styles.participantCard}>
              <div className={styles.participantHeader}>
                <span className={`${styles.avatar} ${styles.avatarDriver}`} aria-hidden="true">
                  {incident.driver ? initialsOf(incident.driver.name) : '—'}
                </span>
                <div className={styles.participantInfo}>
                  <p className={styles.participantName}>
                    {incident.driver?.name ?? t('summary.noDriver')}
                  </p>
                  <p className={styles.participantRole}>{t('participants.driverRole')}</p>
                </div>
              </div>
              <p className={styles.participantMeta}>
                {driverCall === undefined
                  ? t('driverCall.noCall')
                  : t(`driverCall.callStatus.${driverCall.status}`)}
              </p>
            </article>

            <article className={styles.participantCard}>
              <div className={styles.participantHeader}>
                <span className={`${styles.avatar} ${styles.avatarAgent}`} aria-hidden="true">
                  A
                </span>
                <div className={styles.participantInfo}>
                  <p className={styles.participantName}>{t('participants.agentName')}</p>
                  <p className={styles.participantRole}>{t('participants.agentRole')}</p>
                </div>
              </div>
              <p className={styles.participantMeta}>
                <StatusBadge status={incident.status} />
              </p>
            </article>
          </section>

          <section className={styles.card} aria-labelledby="driver-connection-steps-title">
            <h2 id="driver-connection-steps-title" className={styles.cardTitle}>
              {t('connectionSteps.title')}
            </h2>
            <ol className={styles.stepsGrid}>
              {steps.map(({ key, state }) => (
                <li key={key} className={styles.step} data-state={state}>
                  <div className={styles.stepBar} aria-hidden="true" />
                  <p className={styles.stepLabel}>{t(`connectionSteps.${key}`)}</p>
                  <p className={styles.stepState}>
                    {t(
                      `connectionSteps.${state === 'done' ? 'completed' : state === 'active' ? 'active' : 'pending'}`,
                    )}
                  </p>
                </li>
              ))}
            </ol>
          </section>

          <DriverCallPanel
            incidentId={incident.id}
            status={incident.status}
            hasDriver={incident.driver !== null}
            call={driverCall}
          />

          <div className={styles.card}>
            {incident.description && (
              <p className={styles.descriptionQuote}>«{incident.description}»</p>
            )}
            <EvidenceGallery evidence={evidence} />
          </div>

          <IncidentSummary incident={incident} />
        </div>

        <div className={styles.side}>
          {incident.status === 'in_mediation' && <MediationOutcomeForm incidentId={incident.id} />}

          {CLOSED_STATUSES.includes(incident.status) && (
            <p className={styles.closed}>
              {t('closed')} <StatusBadge status={incident.status} />
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
