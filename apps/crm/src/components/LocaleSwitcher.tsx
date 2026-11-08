'use client';

import { sharedMessages } from '@csl/i18n';
import { SUPPORTED_LOCALES } from '@csl/shared-types';
import { useLocale, useTranslations } from 'next-intl';
import { useId, useTransition } from 'react';

import { setLocale } from '../i18n/actions';

import styles from './LocaleSwitcher.module.css';

export function LocaleSwitcher() {
  const t = useTranslations('localeSwitcher');
  const locale = useLocale();
  const [isPending, startTransition] = useTransition();
  const id = useId();

  return (
    <div className={styles.switcher}>
      <label htmlFor={id}>{t('label')}</label>
      <select
        id={id}
        className={styles.select}
        value={locale}
        disabled={isPending}
        onChange={(event) => {
          const next = event.target.value;

          startTransition(() => setLocale(next));
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
