import Link from 'next/link';
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
        <Link href="/inbox" className={styles.brandLink}>
          {t.rich('brand', {
            accent: (chunks) => <span className={styles.accent}>{chunks}</span>,
          })}
        </Link>
      </p>
      <form method="get" action="/inbox" className={styles.searchForm} role="search">
        <input
          type="search"
          name="q"
          className={styles.searchInput}
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchLabel')}
        />
      </form>
      <ConnectionStatus />
      <LocaleSwitcher />
      <LogoutButton />
    </header>
  );
}
