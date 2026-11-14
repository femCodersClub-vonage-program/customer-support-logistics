import { diffMessageKeys } from '@csl/i18n/testing';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '@csl/shared-types';
import { describe, expect, it } from 'vitest';

import { clientMessages } from './messages.ts';

const otherLocales = SUPPORTED_LOCALES.filter((locale) => locale !== DEFAULT_LOCALE);

describe('clientMessages', () => {
  it.each(otherLocales)('has the same keys in %s as in the default locale', (locale) => {
    expect(diffMessageKeys(clientMessages[DEFAULT_LOCALE], clientMessages[locale])).toEqual({
      missing: [],
      extra: [],
    });
  });
});
