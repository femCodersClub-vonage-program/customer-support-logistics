import { useParams } from 'react-router';
import { useTranslations } from 'use-intl';

import { useBlockInterruptions } from '../pwa/interruptions.ts';

export function CallPage() {
  const { id } = useParams();
  const t = useTranslations('call');

  useBlockInterruptions();

  return (
    <main>
      <h1>{t('title')}</h1>
      <p>{t('incident', { id: id ?? '' })}</p>
    </main>
  );
}
