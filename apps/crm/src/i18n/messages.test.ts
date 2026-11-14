import { diffMessageKeys } from '@csl/i18n/testing';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '@csl/shared-types';
import { describe, expect, it } from 'vitest';

import { crmMessages } from './messages';

const otherLocales = SUPPORTED_LOCALES.filter((locale) => locale !== DEFAULT_LOCALE);

describe('crmMessages', () => {
  it.each(otherLocales)('has the same keys in %s as in the default locale', (locale) => {
    expect(diffMessageKeys(crmMessages[DEFAULT_LOCALE], crmMessages[locale])).toEqual({
      missing: [],
      extra: [],
    });
  });
});
