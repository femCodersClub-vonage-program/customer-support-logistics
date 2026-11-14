import { ApiError } from '@csl/api-client';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { DriverCallPanel } from '../../../../components/DriverCallPanel';
import { IncidentSummary } from '../../../../components/IncidentSummary';
import { MediationOutcomeForm } from '../../../../components/MediationOutcomeForm';
import { StatusBadge } from '../../../../components/StatusBadge';
import { serverApi } from '../../../../lib/api.server';
import { latestDriverCall } from '../../../../lib/mediation';
import { shortId } from '../../../../lib/short-id';

import styles from './page.module.css';

import type { Incident } from '@csl/shared-types';

interface MediationPageProps {
  params: Promise<{ id: Incident['id'] }>;
}

const CLOSED_STATUSES: readonly Incident['status'][] = ['resolved', 'escalated'];

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

  return (
    <>
      <h1>{t('title')}</h1>
      <p>{t('incident', { id: shortId(incident.id) })}</p>

      <div className={styles.layout}>
        <IncidentSummary incident={incident} />

        <div className={styles.side}>
          <DriverCallPanel
            incidentId={incident.id}
            status={incident.status}
            hasDriver={incident.driver !== null}
            call={latestDriverCall(incident.communications)}
          />

          {incident.status === 'in_mediation' && <MediationOutcomeForm incidentId={incident.id} />}

          {CLOSED_STATUSES.includes(incident.status) && (
            <p className={styles.closed}>
              {t('closed')} <StatusBadge status={incident.status} />
            </p>
          )}
        </div>
      </div>
    </>
  );
}
