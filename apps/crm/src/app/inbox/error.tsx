'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { startTransition } from 'react';

import styles from './page.module.css';

export default function InboxError({
  reset,
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  const t = useTranslations('inbox.error');
  const router = useRouter();

  function retry() {
    startTransition(() => {
      router.refresh();
      reset();
    });
  }

  return (
    <div className={`${styles.stateCard} ${styles.errorCard}`}>
      <p role="alert">{t('message')}</p>
      <button type="button" className={styles.retryButton} onClick={retry}>
        {t('retry')}
      </button>
    </div>
  );
}
