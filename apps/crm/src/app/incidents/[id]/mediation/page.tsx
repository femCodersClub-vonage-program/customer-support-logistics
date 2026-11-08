import { getTranslations } from 'next-intl/server';

import type { Incident } from '@csl/shared-types';

interface MediationPageProps {
  params: Promise<{ id: Incident['id'] }>;
}

export default async function MediationPage({ params }: MediationPageProps) {
  const { id } = await params;
  const t = await getTranslations('mediation');

  return (
    <>
      <h1>{t('title')}</h1>
      <p>{t('incident', { id })}</p>
    </>
  );
}
