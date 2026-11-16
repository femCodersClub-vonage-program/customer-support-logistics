import { getTranslations } from 'next-intl/server';

import { EvidenceGallery } from '../../../components/EvidenceGallery';
import { serverApi } from '../../../lib/api.server';

import type { Incident } from '@csl/shared-types';

interface IncidentPageProps {
  params: Promise<{ id: Incident['id'] }>;
}

export default async function IncidentPage({ params }: IncidentPageProps) {
  const { id } = await params;
  const t = await getTranslations('incident');
  const evidence = await serverApi.listEvidence(id);

  return (
    <>
      <h1>{t('title')}</h1>
      <p>{t('reference', { id })}</p>
      <EvidenceGallery evidence={evidence} />
    </>
  );
}
