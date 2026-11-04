'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import styles from './SideNav.module.css';

const NAV_ITEMS = [{ href: '/inbox', label: 'Inbox' }] as const;

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SideNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Main" className={styles.nav}>
      <ul className={styles.list}>
        {NAV_ITEMS.map(({ href, label }) => {
          const isActive = isActivePath(pathname, href);

          return (
            <li key={href}>
              <Link
                href={href}
                className={isActive ? `${styles.link} ${styles.active}` : styles.link}
                aria-current={isActive ? 'page' : undefined}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
