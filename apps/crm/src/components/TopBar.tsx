import { useTranslations } from 'next-intl';

import { ConnectionStatus } from './ConnectionStatus';
import { LocaleSwitcher } from './LocaleSwitcher';
import { LogoutButton } from './LogoutButton';
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
      <ConnectionStatus />
      <LocaleSwitcher />
      <LogoutButton />
    </header>
  );
}
