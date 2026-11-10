import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { pageHref } from '../lib/inbox-query';

import styles from './Pagination.module.css';

import type { SearchParams } from '../lib/inbox-query';

export function Pagination({
  params,
  total,
  limit,
  offset,
}: Readonly<{ params: SearchParams; total: number; limit: number; offset: number }>) {
  const t = useTranslations('inbox.pagination');
  const page = Math.floor(offset / limit) + 1;
  const pages = Math.max(1, Math.ceil(total / limit));

  return (
    <nav aria-label={t('label')} className={styles.nav}>
      {page > 1 ? (
        <Link href={pageHref(params, Math.min(page - 1, pages))}>{t('previous')}</Link>
      ) : (
        <span className={styles.disabled}>{t('previous')}</span>
      )}
      <span>{t('status', { page, pages, total })}</span>
      {page < pages ? (
        <Link href={pageHref(params, page + 1)}>{t('next')}</Link>
      ) : (
        <span className={styles.disabled}>{t('next')}</span>
      )}
    </nav>
  );
}
