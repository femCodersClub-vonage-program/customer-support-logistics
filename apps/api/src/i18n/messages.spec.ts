import { diffMessageKeys } from '@csl/i18n/testing';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '@csl/shared-types';
import { describe, expect, it } from 'vitest';

import { apiMessages } from './messages.js';

const otherLocales = SUPPORTED_LOCALES.filter((locale) => locale !== DEFAULT_LOCALE);

describe('apiMessages', () => {
  it.each(otherLocales)('has the same keys in %s as in the default locale', (locale) => {
    expect(diffMessageKeys(apiMessages[DEFAULT_LOCALE], apiMessages[locale])).toEqual({
      missing: [],
      extra: [],
    });
  });
});
