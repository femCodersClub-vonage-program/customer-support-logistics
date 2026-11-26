import { useQueries } from '@tanstack/react-query';
import { PhoneCall } from 'lucide-react';
import { Link } from 'react-router';
import { useFormatter, useTranslations } from 'use-intl';

import { api } from '../api.ts';
import { useSession } from '../auth/session-context.ts';
import { DATE_TIME_FORMAT } from '../incident/date-format.ts';
import '../incident/incidents-list.css';
import { readCustomerIncidents } from '../incident/known-incidents.ts';
import { canJoinCall } from '../incident/progress.ts';

import type { IncidentDetail } from '@csl/contracts';

const STATUS_STEP_KEYS = {
  open: 'reported',
  notified: 'notified',
  in_mediation: 'in_mediation',
  resolved: 'resolved',
  escalated: 'escalated',
} as const;

export function IncidentsPage() {
  const t = useTranslations();
  const format = useFormatter();
  const { state } = useSession();
  const customerId = state.status === 'ready' ? (state.user?.id ?? null) : null;
  const incidentIds = customerId ? readCustomerIncidents(customerId) : [];

  const results = useQueries({
    queries: incidentIds.map((id) => ({
      queryKey: ['incidents', id],
      queryFn: ({ signal }: { signal: AbortSignal }) => api.getIncident(id, { signal }),
    })),
  });

  const isLoading = results.some((result) => result.isPending);
  const incidents = results
    .map((result) => result.data)
    .filter((item): item is IncidentDetail => item !== undefined)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));

  return (
    <main className="incidents-page">
      <div className="incidents-page__container">
        <header className="incidents-page__header">
          <h1 className="incidents-page__title">{t('incidentsList.title')}</h1>
          <p className="incidents-page__subtitle">{t('incidentsList.subtitle')}</p>
        </header>

        {isLoading && incidents.length === 0 && (
          <div className="incidents-page__state">
            <p role="status">{t('incidentsList.loading')}</p>
          </div>
        )}

        {!isLoading && incidents.length === 0 && (
          <div className="incidents-page__state">
            <p>{t('incidentsList.empty')}</p>
            <Link to="/orders" className="incident-card__button">
              {t('incidentsList.goToOrders')}
            </Link>
          </div>
        )}

        {incidents.length > 0 && (
          <section className="incidents-page__list" aria-label={t('incidentsList.title')}>
            {incidents.map((incident) => (
              <article key={incident.id} className="incident-card">
                <div className="incident-card__header">
                  <h2 className="incident-card__title">{t(`incident.type.${incident.type}`)}</h2>
                  <span className={`incident-card__badge incident-card__badge--${incident.status}`}>
                    {t(`incident.progress.steps.${STATUS_STEP_KEYS[incident.status]}`)}
                  </span>
                </div>

                <p className="incident-card__meta">
                  <span className="incident-card__order">
                    {t('incidentsList.order', { id: incident.order.id })}
                  </span>
                  <time dateTime={incident.createdAt}>
                    {format.dateTime(new Date(incident.createdAt), DATE_TIME_FORMAT)}
                  </time>
                </p>

                {incident.description && (
                  <p className="incident-card__description">{incident.description}</p>
                )}

                <div className="incident-card__actions">
                  {canJoinCall(incident) && (
                    <Link to={`/call/${incident.id}`} className="incident-card__button">
                      <PhoneCall size={18} strokeWidth={2} aria-hidden="true" />
                      {t('incident.joinCall')}
                    </Link>
                  )}
                  <Link
                    to={`/incidents/${incident.id}`}
                    className={
                      canJoinCall(incident)
                        ? 'incident-card__button incident-card__button--secondary'
                        : 'incident-card__button'
                    }
                  >
                    {t('incidentsList.viewDetails')}
                  </Link>
                </div>
              </article>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
