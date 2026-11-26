import Link from 'next/link';
import { useTranslations } from 'next-intl';

import styles from './not-found.module.css';

export default function NotFound() {
  const t = useTranslations('notFound');

  return (
    <section className={styles.card}>
      <h1 className={styles.title}>{t('title')}</h1>
      <Link href="/inbox" className={styles.link}>
        {t('backToInbox')}
      </Link>
    </section>
  );
}
