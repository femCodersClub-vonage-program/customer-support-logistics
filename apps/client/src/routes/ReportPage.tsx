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
    <main className="report-page">
      <div className="report-page__card">
        <header className="report-page__header">
          <h1 className="report-page__title">{t('title')}</h1>
          <p className="report-page__order">{t('order', { orderId })}</p>
        </header>
        <ReportForm key={orderId} orderId={orderId} />
      </div>
    </main>
  );
}
