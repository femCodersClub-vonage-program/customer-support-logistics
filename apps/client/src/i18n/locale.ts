import { isLocale, negotiateLocale } from '@csl/i18n';
import { createContext, use } from 'react';

import type { Locale } from '@csl/shared-types';

export const LOCALE_KEY = 'csl:locale';

export function readStoredLocale(): Locale | undefined {
  try {
    const stored = localStorage.getItem(LOCALE_KEY);

    return isLocale(stored) ? stored : undefined;
  } catch {
    return undefined;
  }
}

export function storeLocale(locale: Locale) {
  try {
    localStorage.setItem(LOCALE_KEY, locale);
  } catch {
    return;
  }
}

export function detectLocale(): Locale {
  return readStoredLocale() ?? negotiateLocale(navigator.languages ?? [navigator.language]);
}

export type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
};

export const LocaleContext = createContext<LocaleContextValue | null>(null);

export function useLocaleSettings() {
  const value = use(LocaleContext);

  if (!value) {
    throw new Error('useLocaleSettings must be used inside LocaleProvider');
  }

  return value;
}
