import { sharedMessages } from '@csl/i18n';

import en from './messages/en.json' with { type: 'json' };
import es from './messages/es.json' with { type: 'json' };

import type { Locale } from '@csl/shared-types';

export type ApiMessages = typeof es;

export const apiMessages: Record<Locale, ApiMessages> = { es, en };

export function getMessages(locale: Locale) {
  return { ...sharedMessages[locale], ...apiMessages[locale] };
}

export type Messages = ReturnType<typeof getMessages>;
