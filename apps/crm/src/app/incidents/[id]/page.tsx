import { ApiError } from '@csl/api-client';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';

import { ContactLanguage } from '../../../components/ContactLanguage';
import { IncidentActions } from '../../../components/IncidentActions';
import { PhoneReveal } from '../../../components/PhoneReveal';
import { StatusBadge } from '../../../components/StatusBadge';
import { CURRENT_AGENT_ID, serverApi } from '../../../lib/api.server';

import type { Incident } from '@csl/shared-types';

interface IncidentPageProps {
  params: Promise<{ id: Incident['id'] }>;
}

export default async function IncidentPage({ params }: IncidentPageProps) {
  const { id } = await params;
  const locale = await getLocale();
  const t = await getTranslations('incident');

  let incident;

  try {
    incident = await serverApi.getIncident(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }

    throw error;
  }

  const timeline = [
    ...incident.events.map((event) => ({
      id: event.id,
      date: event.occurredAt,
      kind: 'event' as const,
      actor: event.actor,
      actorId: event.actorId,
      description: event.reason ?? `${event.fromStatus ?? t('notAvailable')} → ${event.toStatus}`,
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
    <main>
      <h1>{t('title')}</h1>
      <p>{t('reference', { id })}</p>
      <StatusBadge status={incident.status} />
      <p>{t(`type.${incident.type}`)}</p>

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

      <IncidentActions
        incidentId={incident.id}
        status={incident.status}
        agentId={incident.agentId}
        currentAgentId={CURRENT_AGENT_ID}
        hasDriver={Boolean(incident.driver)}
      />
      <section aria-labelledby="order-heading">
        <h2 id="order-heading">{t('sections.order')}</h2>
        <p>{incident.order.id}</p>
        <p>{incident.order.address}</p>
        <p>{incident.order.status}</p>
        <p>{incident.order.routeId ?? t('notAvailable')}</p>
      </section>

      <section aria-labelledby="customer-heading">
        <h2 id="customer-heading">{t('sections.customer')}</h2>
        <p>{incident.customer.name}</p>
        <PhoneReveal phone={incident.customer.phone} />
        <ContactLanguage role="customer" locale={incident.customer.locale} />
      </section>

      <section aria-labelledby="driver-heading">
        <h2 id="driver-heading">{t('sections.driver')}</h2>
        {incident.driver ? <p>{incident.driver.name}</p> : <p>{t('notAvailable')}</p>}
      </section>

      <section aria-labelledby="evidence-heading">
        <h2 id="evidence-heading">{t('sections.evidence')}</h2>
        {incident.evidence.length === 0 ? (
          <p>{t('emptyEvidence')}</p>
        ) : (
          <ul>
            {incident.evidence.map((item) => (
              <li key={item.id}>
                <p>{item.mimeType}</p>
                <p>
                  {item.sizeBytes} {t('bytes')}
                </p>
                <time dateTime={item.createdAt}>
                  {new Date(item.createdAt).toLocaleString(locale)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="timeline-heading">
        <h2 id="timeline-heading">{t('sections.timeline')}</h2>
        {timeline.length === 0 ? (
          <p>{t('emptyTimeline')}</p>
        ) : (
          <ol>
            {timeline.map((item) => (
              <li key={`${item.kind}-${item.id}`}>
                <time dateTime={item.date}>{new Date(item.date).toLocaleString(locale)}</time>
                {' — '}
                {item.kind === 'event' && (
                  <span>
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
    </main>
  );
}
