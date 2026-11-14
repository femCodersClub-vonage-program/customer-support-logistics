import { useTranslations } from 'use-intl';

import { ApiStatus } from '../components/ApiStatus.tsx';

export function DevPage() {
  const t = useTranslations('dev');

  return (
    <main>
      <h1>{t('title')}</h1>
      <ApiStatus />
    </main>
  );
}
