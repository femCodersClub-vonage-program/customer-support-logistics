import { isLocale, sharedMessages } from '@csl/i18n';
import { SUPPORTED_LOCALES } from '@csl/shared-types';
import { useId } from 'react';
import { useTranslations } from 'use-intl';

import { useLocaleSettings } from './locale.ts';
import './i18n.css';

export function LocaleSwitcher() {
  const t = useTranslations('localeSwitcher');
  const { locale, setLocale } = useLocaleSettings();
  const id = useId();

  return (
    <div className="locale-switcher">
      <label htmlFor={id}>{t('label')}</label>
      <select
        id={id}
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
    </div>
  );
}
