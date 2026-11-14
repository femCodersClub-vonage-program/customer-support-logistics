import { useTranslations } from 'next-intl';

import { LocaleSwitcher } from './LocaleSwitcher';
import styles from './TopBar.module.css';

export function TopBar() {
  const t = useTranslations('topBar');

  return (
    <header className={styles.bar}>
      <p className={styles.brand}>
        {t.rich('brand', {
          accent: (chunks) => <span className={styles.accent}>{chunks}</span>,
        })}
      </p>
      <LocaleSwitcher />
    </header>
  );
}
