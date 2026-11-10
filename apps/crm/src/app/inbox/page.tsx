import { INCIDENT_STATUSES } from '@csl/shared-types';
import { getTranslations } from 'next-intl/server';

import { IncidentTable } from '../../components/IncidentTable';
import { serverApi } from '../../lib/api.server';

const ACTIVE_STATUSES = INCIDENT_STATUSES.filter((status) => status !== 'resolved');

export default async function InboxPage() {
  const t = await getTranslations('inbox');
  const { items } = await serverApi.listIncidents({ status: ACTIVE_STATUSES, order: 'asc' });

  return (
    <>
      <h1>{t('title')}</h1>
      <IncidentTable items={items} />
    </>
  );
}