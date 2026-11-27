import { isLocale, sharedMessages } from '@csl/i18n';
import { SUPPORTED_LOCALES } from '@csl/shared-types';
import { Box, Check, ChevronRight, Clock, LogOut } from 'lucide-react';
import { useId } from 'react';
import { Link, useNavigate } from 'react-router';
import { useTranslations } from 'use-intl';

import { useSession } from '../auth/session-context.ts';
import { useLocaleSettings } from '../i18n/locale.ts';
import '../profile/profile.css';

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return '?';
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function ProfilePage() {
  const t = useTranslations();
  const navigate = useNavigate();
  const { state, logOut } = useSession();
  const { locale, setLocale } = useLocaleSettings();
  const localeId = useId();

  const name = state.status === 'ready' ? (state.user?.name ?? '') : '';

  const handleLogOut = async () => {
    await logOut().catch(() => undefined);
    await navigate('/login', { replace: true });
  };

  return (
    <main className="profile-page">
      <div className="profile-page__container">
        <h1 className="profile-page__title">{t('profile.title')}</h1>

        <section className="profile-card" aria-labelledby="profile-account-heading">
          <div className="profile-card__identity">
            <span className="profile-card__avatar" aria-hidden="true">
              {initialsOf(name)}
            </span>
            <div className="profile-card__info">
              <h2 id="profile-account-heading" className="profile-card__name">
                {name}
              </h2>
              <p className="profile-card__verified">
                <Check size={15} strokeWidth={2.5} aria-hidden="true" />
                <span>{t('profile.verifiedPhone')}</span>
              </p>
            </div>
          </div>
        </section>

        <section className="profile-card" aria-labelledby="profile-shortcuts-heading">
          <h2 id="profile-shortcuts-heading" className="profile-card__section-title">
            {t('profile.shortcuts')}
          </h2>
          <ul className="profile-card__links">
            <li>
              <Link to="/orders" className="profile-card__link">
                <span className="profile-card__link-label">
                  <Box size={18} strokeWidth={2} aria-hidden="true" />
                  <span>{t('nav.orders')}</span>
                </span>
                <ChevronRight size={18} strokeWidth={2} aria-hidden="true" />
              </Link>
            </li>
            <li>
              <Link to="/incidents" className="profile-card__link">
                <span className="profile-card__link-label">
                  <Clock size={18} strokeWidth={2} aria-hidden="true" />
                  <span>{t('nav.incidents')}</span>
                </span>
                <ChevronRight size={18} strokeWidth={2} aria-hidden="true" />
              </Link>
            </li>
          </ul>
        </section>

        <section className="profile-card" aria-labelledby="profile-settings-heading">
          <h2 id="profile-settings-heading" className="profile-card__section-title">
            {t('profile.settings')}
          </h2>
          <label htmlFor={localeId} className="profile-card__field">
            {t('profile.language')}
            <select
              id={localeId}
              className="profile-card__select"
              value={locale}
              onChange={(event) => {
                if (isLocale(event.target.value)) {
                  setLocale(event.target.value);
                }
              }}
            >
              {SUPPORTED_LOCALES.map((option) => (
                <option key={option} value={option} lang={option}>
                  {sharedMessages[option].localeName[option]}
                </option>
              ))}
            </select>
          </label>
        </section>

        <button type="button" className="profile-card__logout" onClick={handleLogOut}>
          <LogOut size={18} strokeWidth={2} aria-hidden="true" />
          {t('profile.logOut')}
        </button>
      </div>
    </main>
  );
}
