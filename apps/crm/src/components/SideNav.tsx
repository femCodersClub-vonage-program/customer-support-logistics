'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { ASSIGNEE_ME } from '../lib/inbox-query';

import styles from './SideNav.module.css';

interface NavItem {
  href: string;
  labelKey: 'inbox' | 'myTickets' | 'escalated' | 'resolved';
  isActive: (pathname: string, params: URLSearchParams) => boolean;
}

const NAV_ITEMS: readonly NavItem[] = [
  {
    href: '/inbox',
    labelKey: 'inbox',
    isActive: (pathname, params) => {
      if (pathname !== '/inbox' && !pathname.startsWith('/inbox/')) {
        return false;
      }

      const statuses = params.getAll('status').filter(Boolean);
      const isMyTickets = params.get('agentId') === ASSIGNEE_ME && statuses.length === 0;
      const isEscalated = statuses.length === 1 && statuses[0] === 'escalated';
      const isResolved = statuses.length === 1 && statuses[0] === 'resolved';

      return !isMyTickets && !isEscalated && !isResolved;
    },
  },
  {
    href: `/inbox?agentId=${ASSIGNEE_ME}`,
    labelKey: 'myTickets',
    isActive: (pathname, params) =>
      pathname === '/inbox' &&
      params.get('agentId') === ASSIGNEE_ME &&
      params.getAll('status').filter(Boolean).length === 0,
  },
  {
    href: '/inbox?status=escalated',
    labelKey: 'escalated',
    isActive: (pathname, params) => {
      const statuses = params.getAll('status').filter(Boolean);

      return pathname === '/inbox' && statuses.length === 1 && statuses[0] === 'escalated';
    },
  },
  {
    href: '/inbox?status=resolved',
    labelKey: 'resolved',
    isActive: (pathname, params) => {
      const statuses = params.getAll('status').filter(Boolean);

      return pathname === '/inbox' && statuses.length === 1 && statuses[0] === 'resolved';
    },
  },
];

export function SideNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useTranslations('nav');

  return (
    <nav aria-label={t('label')} className={styles.nav}>
      <ul className={styles.list}>
        {NAV_ITEMS.map(({ href, labelKey, isActive }) => {
          const active = isActive(pathname, searchParams);

          return (
            <li key={href}>
              <Link
                href={href}
                className={active ? `${styles.link} ${styles.active}` : styles.link}
                aria-current={active ? 'page' : undefined}
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
