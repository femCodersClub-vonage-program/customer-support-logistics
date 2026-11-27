import { Box, Clock, User } from 'lucide-react';
import { Link, useLocation } from 'react-router';
import { useTranslations } from 'use-intl';

import './navigation.css';

const NAV_ITEMS = [
  {
    to: '/orders',
    labelKey: 'orders',
    icon: Box,
    matches: (pathname: string) =>
      pathname === '/orders' || pathname.startsWith('/orders/') || pathname.startsWith('/report/'),
  },
  {
    to: '/incidents',
    labelKey: 'incidents',
    icon: Clock,
    matches: (pathname: string) => pathname === '/incidents' || pathname.startsWith('/incidents/'),
  },
  {
    to: '/profile',
    labelKey: 'profile',
    icon: User,
    matches: (pathname: string) => pathname === '/profile' || pathname.startsWith('/profile/'),
  },
] as const;

export function CustomerNav() {
  const t = useTranslations('nav');
  const { pathname } = useLocation();

  return (
    <nav className="customer-nav" aria-label={t('label')}>
      <ul className="customer-nav__list">
        {NAV_ITEMS.map(({ to, labelKey, icon: Icon, matches }) => {
          const active = matches(pathname);

          return (
            <li key={to} className="customer-nav__item">
              <Link
                to={to}
                className={
                  active ? 'customer-nav__link customer-nav__link--active' : 'customer-nav__link'
                }
                aria-current={active ? 'page' : undefined}
              >
                <Icon size={22} strokeWidth={active ? 2.2 : 1.8} aria-hidden="true" />
                <span>{t(labelKey)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
