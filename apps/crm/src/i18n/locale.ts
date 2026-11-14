import { isLocale, negotiateLocale, parseAcceptLanguage } from '@csl/i18n';

import type { Locale } from '@csl/shared-types';

export const LOCALE_COOKIE = 'NEXT_LOCALE';

export const TIME_ZONE = 'Europe/Madrid';

export function resolveLocale(
  cookieValue: string | undefined,
  acceptLanguage: string | null,
): Locale {
  if (isLocale(cookieValue)) {
    return cookieValue;
  }

  return negotiateLocale(parseAcceptLanguage(acceptLanguage));
}
