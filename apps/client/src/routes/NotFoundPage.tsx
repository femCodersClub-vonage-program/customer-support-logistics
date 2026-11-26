import { Link } from 'react-router';
import { useTranslations } from 'use-intl';

import './pages.css';

export function NotFoundPage() {
  const t = useTranslations('notFound');

  return (
    <main className="page-shell">
      <section className="page-card">
        <h1 className="page-card__title">{t('title')}</h1>
        <Link to="/orders" className="page-card__action">
          {t('backToOrders')}
        </Link>
      </section>
    </main>
  );
}
