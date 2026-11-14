import { useParams } from 'react-router';
import { useTranslations } from 'use-intl';

export function IncidentPage() {
  const { id } = useParams();
  const t = useTranslations('incident');

  return (
    <main>
      <h1>{t('title')}</h1>
      <p>{t('reference', { id: id ?? '' })}</p>
    </main>
  );
}
