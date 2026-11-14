import { sharedMessages } from '@csl/i18n';

import en from './messages/en.json';
import es from './messages/es.json';

import type { Locale } from '@csl/shared-types';

export type CrmMessages = typeof es;

export const crmMessages: Record<Locale, CrmMessages> = { es, en };

export function getMessages(locale: Locale) {
  return { ...sharedMessages[locale], ...crmMessages[locale] };
}

export type Messages = ReturnType<typeof getMessages>;
