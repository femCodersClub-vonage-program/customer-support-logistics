import { ApiError } from '@csl/api-client';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';

import { ContactLanguage } from '../../../components/ContactLanguage';
import { EvidenceGallery } from '../../../components/EvidenceGallery';
import { IncidentActions } from '../../../components/IncidentActions';
import { PhoneReveal } from '../../../components/PhoneReveal';
import { StatusBadge } from '../../../components/StatusBadge';
import { currentAgentId, serverApi } from '../../../lib/api.server';
import { isDriverReplyReason } from '../../../lib/mediation';

import styles from './page.module.css';

import type { Incident } from '@csl/shared-types';

interface IncidentPageProps {
  params: Promise<{ id: Incident['id'] }>;
}

export default async function IncidentPage({ params }: IncidentPageProps) {
  const { id } = await params;
  const locale = await getLocale();
  const t = await getTranslations('incident');
  const tSummary = await getTranslations('mediation.summary');

  let incident;

  try {
    incident = await serverApi.getIncident(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }

    throw error;
  }

  const [agentId, evidence] = await Promise.all([currentAgentId(), serverApi.listEvidence(id)]);

  const timeline = [
    ...incident.events.map((event) => ({
      id: event.id,
      date: event.occurredAt,
      kind: 'event' as const,
      actor: event.actor,
      actorId: event.actorId,
      description:
        event.actor === 'driver' && isDriverReplyReason(event.reason)
          ? tSummary(`driverReply.${event.reason}`)
          : (event.reason ?? `${event.fromStatus ?? t('notAvailable')} → ${event.toStatus}`),
    })),
    ...incident.communications.map((communication) => ({
      id: communication.id,
      date: communication.createdAt,
      kind: 'communication' as const,
      description: `${t(`communication.direction.${communication.direction}`)} ${t(
        `communication.channel.${communication.channel}`,
      )} (${t(`communication.status.${communication.status}`)})`,
    })),
  ].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroTop}>
          <div className={styles.heroTitleGroup}>
            <h1 className={styles.title}>{t('title')}</h1>
            <StatusBadge status={incident.status} />
            <p className={styles.typePill}>{t(`type.${incident.type}`)}</p>
          </div>
          <p className={styles.reference}>{t('reference', { id })}</p>
        </div>

        <div className={styles.metaRow}>
          <p>
            {t('createdAt')}:{' '}
            <time dateTime={incident.createdAt}>
              {new Date(incident.createdAt).toLocaleString(locale)}
            </time>
          </p>
          <p>
            {t('updatedAt')}:{' '}
            <time dateTime={incident.updatedAt}>
              {new Date(incident.updatedAt).toLocaleString(locale)}
            </time>
          </p>
          <p>
            {t('assignedAgent')}: {incident.agentId ?? t('unassigned')}
          </p>
        </div>
      </header>

      <div className={styles.grid}>
        <div className={styles.mainColumn}>
          <IncidentActions
            incidentId={incident.id}
            status={incident.status}
            agentId={incident.agentId}
            currentAgentId={agentId}
            hasDriver={Boolean(incident.driver)}
          />

          <div className={styles.card}>
            <EvidenceGallery evidence={evidence} />
          </div>

          <section className={styles.card} aria-labelledby="timeline-heading">
            <h2 id="timeline-heading" className={styles.cardTitle}>
              {t('sections.timeline')}
            </h2>
            {timeline.length === 0 ? (
              <p className={styles.muted}>{t('emptyTimeline')}</p>
            ) : (
              <ol className={styles.timeline}>
                {timeline.map((item) => (
                  <li
                    key={`${item.kind}-${item.id}`}
                    className={styles.timelineItem}
                    data-kind={item.kind}
                  >
                    <time className={styles.timelineTime} dateTime={item.date}>
                      {new Date(item.date).toLocaleString(locale)}
                    </time>
                    {' — '}
                    {item.kind === 'event' && (
                      <span className={styles.timelineActor}>
                        {t(`actor.${item.actor}`)}
                        {item.actorId ? ` (${item.actorId})` : ''}
                        {' — '}
                      </span>
                    )}
                    {item.description}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <div className={styles.sideColumn}>
          <section className={styles.card} aria-labelledby="order-heading">
            <h2 id="order-heading" className={styles.cardTitle}>
              {t('sections.order')}
            </h2>
            <p className={styles.mono}>{incident.order.id}</p>
            <p>{incident.order.address}</p>
            <p className={styles.muted}>{incident.order.status}</p>
            <p className={styles.muted}>{incident.order.routeId ?? t('notAvailable')}</p>
          </section>

          <section className={styles.card} aria-labelledby="customer-heading">
            <h2 id="customer-heading" className={styles.cardTitle}>
              {t('sections.customer')}
            </h2>
            <p>{incident.customer.name}</p>
            <PhoneReveal phone={incident.customer.phone} />
            <ContactLanguage role="customer" locale={incident.customer.locale} />
          </section>

          <section className={styles.card} aria-labelledby="driver-heading">
            <h2 id="driver-heading" className={styles.cardTitle}>
              {t('sections.driver')}
            </h2>
            {incident.driver ? (
              <p>{incident.driver.name}</p>
            ) : (
              <p className={styles.muted}>{t('notAvailable')}</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
