import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '@csl/shared-types';

import type { Locale } from '@csl/shared-types';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

function findLocale(tag: string): Locale | undefined {
  return SUPPORTED_LOCALES.find((locale) => locale.toLowerCase() === tag);
}

export function negotiateLocale(preferred: readonly string[]): Locale {
  for (const tag of preferred) {
    const normalised = tag.trim().toLowerCase();
    const [language = ''] = normalised.split('-');
    const match = findLocale(normalised) ?? findLocale(language);

    if (match) {
      return match;
    }
  }

  return DEFAULT_LOCALE;
}

export function parseAcceptLanguage(header: string | null | undefined): string[] {
  if (!header) {
    return [];
  }

  return header
    .split(',')
    .map((part, index) => {
      const [tag = '', ...params] = part.trim().split(';');
      const qParam = params.map((param) => param.trim()).find((param) => param.startsWith('q='));
      const quality = qParam ? Number(qParam.slice(2)) : 1;

      return { tag: tag.trim(), quality: Number.isNaN(quality) ? 0 : quality, index };
    })
    .filter(({ tag, quality }) => tag !== '' && tag !== '*' && quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index)
    .map(({ tag }) => tag);
}
