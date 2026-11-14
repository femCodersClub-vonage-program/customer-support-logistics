import { createTranslator } from 'use-intl/core';

import { getMessages } from './messages.js';

import type { Messages } from './messages.js';
import type { Locale } from '@csl/shared-types';
import type { IntlError } from 'use-intl/core';

const translators = new Map<Locale, ReturnType<typeof buildTranslator>>();

function buildTranslator(locale: Locale) {
  return createTranslator<Messages>({
    locale,
    messages: getMessages(locale),
    onError: (error: IntlError) => {
      throw error;
    },
  });
}

export function getTranslator(locale: Locale) {
  let translator = translators.get(locale);

  if (!translator) {
    translator = buildTranslator(locale);
    translators.set(locale, translator);
  }

  return translator;
}
