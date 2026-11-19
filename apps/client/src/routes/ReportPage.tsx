import { uuidSchema } from '@csl/contracts';
import { useParams } from 'react-router';
import { useTranslations } from 'use-intl';

import { ReportForm } from '../report/ReportForm.tsx';

import { NotFoundPage } from './NotFoundPage.tsx';

export function ReportPage() {
  const { orderId = '' } = useParams();
  const t = useTranslations('report');

  if (!uuidSchema.safeParse(orderId).success) {
    return <NotFoundPage />;
  }

  return (
    <main>
      <h1>{t('title')}</h1>
      <p>{t('order', { orderId })}</p>
      <ReportForm key={orderId} orderId={orderId} />
    </main>
  );
}
