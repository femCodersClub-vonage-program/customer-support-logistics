import { ApiError } from '@csl/api-client';
import { uuidSchema } from '@csl/contracts';
import { useQuery } from '@tanstack/react-query';
import { PhoneCall } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { useFormatter, useTranslations } from 'use-intl';

import { api } from '../api.ts';
import { DATE_TIME_FORMAT } from '../incident/date-format.ts';
import '../incident/incident.css';
import { IncidentEvidence } from '../incident/IncidentEvidence.tsx';
import { IncidentProgress } from '../incident/IncidentProgress.tsx';
import { IncidentTimeline } from '../incident/IncidentTimeline.tsx';
import { canJoinCall } from '../incident/progress.ts';

import type { IncidentDetail } from '@csl/contracts';
import type { ReactNode } from 'react';

const isNotFound = (error: unknown) => error instanceof ApiError && error.status === 404;

function IncidentLayout({ children }: { children: ReactNode }) {
  return (
    <main className="incident-page">
      <div className="incident-page__container">{children}</div>
    </main>
  );
}

function BackToOrders() {
  const t = useTranslations('incident');

  return (
    <Link to="/orders" className="incident-page__back">
      {t('backToOrders')}
    </Link>
  );
}

function IncidentNotFound() {
  const t = useTranslations('incident.notFound');

  return (
    <IncidentLayout>
      <section className="incident-section">
        <h1 className="incident-page__title">{t('title')}</h1>
        <p className="incident-section__text">{t('description')}</p>
        <BackToOrders />
      </section>
    </IncidentLayout>
  );
}

function IncidentSummary({ incident }: { incident: IncidentDetail }) {
  const t = useTranslations('incident');
  const format = useFormatter();
  const formatDate = (value: string) => format.dateTime(new Date(value), DATE_TIME_FORMAT);

  return (
    <section className="incident-section" aria-labelledby="incident-summary-title">
      <h2 id="incident-summary-title" className="incident-section__title">
        {t('summary')}
      </h2>
      <dl className="incident-summary">
        <dt>{t('order')}</dt>
        <dd>{incident.order.id}</dd>
        <dt>{t('typeLabel')}</dt>
        <dd>{t(`type.${incident.type}`)}</dd>
        {incident.description && (
          <>
            <dt>{t('description')}</dt>
            <dd>{incident.description}</dd>
          </>
        )}
        <dt>{t('createdAt')}</dt>
        <dd>
          <time dateTime={incident.createdAt}>{formatDate(incident.createdAt)}</time>
        </dd>
        {incident.closedAt && (
          <>
            <dt>{t('closedAt')}</dt>
            <dd>
              <time dateTime={incident.closedAt}>{formatDate(incident.closedAt)}</time>
            </dd>
          </>
        )}
        {incident.resolution && (
          <>
            <dt>{t('resolution')}</dt>
            <dd>{incident.resolution}</dd>
          </>
        )}
      </dl>
    </section>
  );
}

function IncidentDetails({ id }: { id: string }) {
  const t = useTranslations('incident');

  const {
    data: incident,
    error,
    isPending,
    refetch,
  } = useQuery({
    queryKey: ['incidents', id],
    queryFn: ({ signal }) => api.getIncident(id, { signal }),
  });

  if (isNotFound(error)) {
    return <IncidentNotFound />;
  }

  if (!incident) {
    return (
      <IncidentLayout>
        <h1 className="incident-page__title">{t('title')}</h1>
        {isPending ? (
          <div className="incident-section">
            <p role="status" className="incident-section__text">
              {t('loading')}
            </p>
          </div>
        ) : (
          <div className="incident-section incident-section--error">
            <p role="alert" className="incident-section__error">
              {t('error')}
            </p>
            <button type="button" className="incident-page__button" onClick={() => void refetch()}>
              {t('retry')}
            </button>
          </div>
        )}
      </IncidentLayout>
    );
  }

  return (
    <IncidentLayout>
      <h1 className="incident-page__title">{t('title')}</h1>
      <IncidentProgress incident={incident} />
      {canJoinCall(incident) && (
        <Link to={`/call/${incident.id}`} className="incident-page__button">
          <PhoneCall size={20} strokeWidth={2} aria-hidden="true" />
          {t('joinCall')}
        </Link>
      )}
      <IncidentSummary incident={incident} />
      <IncidentEvidence incidentId={incident.id} evidence={incident.evidence} />
      <IncidentTimeline events={incident.events} />
      <BackToOrders />
    </IncidentLayout>
  );
}

export function IncidentPage() {
  const { id = '' } = useParams();

  if (!uuidSchema.safeParse(id).success) {
    return <IncidentNotFound />;
  }

  return <IncidentDetails key={id} id={id} />;
}
