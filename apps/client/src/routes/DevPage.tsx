import { useTranslations } from 'use-intl';

import { ApiStatus } from '../components/ApiStatus.tsx';
import './pages.css';

export function DevPage() {
  const t = useTranslations('dev');

  return (
    <main className="page-shell">
      <section className="page-card">
        <h1 className="page-card__title">{t('title')}</h1>
        <ApiStatus />
      </section>
    </main>
  );
}
