import { getTranslations } from 'next-intl/server';

import type { Incident } from '@csl/shared-types';

interface IncidentPageProps {
  params: Promise<{ id: Incident['id'] }>;
}

export default async function IncidentPage({ params }: IncidentPageProps) {
  const { id } = await params;
  const t = await getTranslations('incident');

  return (
    <>
      <h1>{t('title')}</h1>
      <p>{t('reference', { id })}</p>
    </>
  );
}
