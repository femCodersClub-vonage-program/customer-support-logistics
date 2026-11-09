import { Link } from 'react-router';
import { useTranslations } from 'use-intl';

export function NotFoundPage() {
  const t = useTranslations('notFound');

  return (
    <main>
      <h1>{t('title')}</h1>
      <Link to="/orders">{t('backToOrders')}</Link>
    </main>
  );
}
