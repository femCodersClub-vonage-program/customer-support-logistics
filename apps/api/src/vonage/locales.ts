import type { Locale } from '@csl/shared-types';

export const TTS_LANGUAGES = {
  es: 'es-ES',
  en: 'en-GB',
} as const satisfies Record<Locale, string>;

export const VERIFY_LOCALES = {
  es: 'es-es',
  en: 'en-gb',
} as const satisfies Record<Locale, string>;

export function toTtsLanguage(locale: Locale) {
  return TTS_LANGUAGES[locale];
}

export function toVerifyLocale(locale: Locale) {
  return VERIFY_LOCALES[locale];
}
