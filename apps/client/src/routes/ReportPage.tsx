import { useParams } from 'react-router';
import { useTranslations } from 'use-intl';

import { ReportForm } from '../report/ReportForm.tsx';

export function ReportPage() {
  const { orderId = '' } = useParams();
  const t = useTranslations('report');

  return (
    <main>
      <h1>{t('title')}</h1>
      <p>{t('order', { orderId })}</p>
      <ReportForm key={orderId} orderId={orderId} />
    </main>
  );
}
