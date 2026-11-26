import { useTranslations } from 'next-intl';

import styles from './page.module.css';

export default function InboxLoading() {
  const t = useTranslations('inbox');

  return (
    <>
      <header className={styles.header}>
        <h1 className={styles.title}>{t('title')}</h1>
      </header>
      <div className={styles.stateCard}>
        <p role="status">{t('loading')}</p>
      </div>
    </>
  );
}
