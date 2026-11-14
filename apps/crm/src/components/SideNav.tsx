'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

import styles from './SideNav.module.css';

const NAV_ITEMS = [{ href: '/inbox', labelKey: 'inbox' }] as const;

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SideNav() {
  const pathname = usePathname();
  const t = useTranslations('nav');

  return (
    <nav aria-label={t('label')} className={styles.nav}>
      <ul className={styles.list}>
        {NAV_ITEMS.map(({ href, labelKey }) => {
          const isActive = isActivePath(pathname, href);

          return (
            <li key={href}>
              <Link
                href={href}
                className={isActive ? `${styles.link} ${styles.active}` : styles.link}
                aria-current={isActive ? 'page' : undefined}
              >
                {t(labelKey)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
