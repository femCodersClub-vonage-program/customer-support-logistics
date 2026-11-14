import { sharedMessages } from '@csl/i18n';

import en from './messages/en.json';
import es from './messages/es.json';

import type { Locale } from '@csl/shared-types';

export type ClientMessages = typeof es;

export const clientMessages: Record<Locale, ClientMessages> = { es, en };

export function getMessages(locale: Locale) {
  return { ...sharedMessages[locale], ...clientMessages[locale] };
}

export type Messages = ReturnType<typeof getMessages>;
