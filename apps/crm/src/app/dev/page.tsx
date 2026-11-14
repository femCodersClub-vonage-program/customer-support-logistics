import { notFound } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { ApiStatus } from '../../components/ApiStatus';

export default function DevPage() {
  const t = useTranslations('dev');

  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  return (
    <>
      <h1>{t('title')}</h1>
      <ApiStatus />
    </>
  );
}
