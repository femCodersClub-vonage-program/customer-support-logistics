import {
  DEFAULT_LOCALE,
  INCIDENT_STATUSES,
  INCIDENT_TYPES,
  ORDER_STATUSES,
  SUPPORTED_LOCALES,
} from '@csl/shared-types';
import { describe, expect, it } from 'vitest';

import { sharedMessages } from './messages.js';
import { diffMessageKeys } from './testing.js';

const otherLocales = SUPPORTED_LOCALES.filter((locale) => locale !== DEFAULT_LOCALE);

describe('sharedMessages', () => {
  it.each(otherLocales)('has the same keys in %s as in the default locale', (locale) => {
    expect(diffMessageKeys(sharedMessages[DEFAULT_LOCALE], sharedMessages[locale])).toEqual({
      missing: [],
      extra: [],
    });
  });

  it.each(SUPPORTED_LOCALES)('labels exactly the shared enum values in %s', (locale) => {
    const messages = sharedMessages[locale];

    expect(Object.keys(messages.incidentStatus).sort()).toEqual([...INCIDENT_STATUSES].sort());
    expect(Object.keys(messages.incidentType).sort()).toEqual([...INCIDENT_TYPES].sort());
    expect(Object.keys(messages.orderStatus).sort()).toEqual([...ORDER_STATUSES].sort());
    expect(Object.keys(messages.localeName).sort()).toEqual([...SUPPORTED_LOCALES].sort());
  });

  it.each(SUPPORTED_LOCALES)('has no empty labels in %s', (locale) => {
    const labels = Object.values(sharedMessages[locale]).flatMap((group) => Object.values(group));

    expect(labels.every((label) => label.trim() !== '')).toBe(true);
  });
});
