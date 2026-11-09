import { getTranslator } from '../i18n/translator.js';

import { toTtsLanguage } from './locales.js';

import type { Incident, Locale, Order } from '@csl/shared-types';

export type TalkAction = {
  action: 'talk';
  text: string;
  language: string;
};

export type InputAction = {
  action: 'input';
  type: ['dtmf'];
  dtmf: { maxDigits: number; timeOut: number };
  eventUrl: [string];
};

export type ConversationAction = {
  action: 'conversation';
  name: string;
};

export type NccoAction = TalkAction | InputAction | ConversationAction;

export const DRIVER_PROMPT_TIMEOUT_SECONDS = 8;

export function buildDriverPromptNcco({
  locale,
  orderId,
  inputUrl,
}: {
  locale: Locale;
  orderId: Order['id'];
  inputUrl: string;
}): NccoAction[] {
  const t = getTranslator(locale);

  return [
    {
      action: 'talk',
      text: t('voice.driverPrompt', { orderId }),
      language: toTtsLanguage(locale),
    },
    {
      action: 'input',
      type: ['dtmf'],
      dtmf: { maxDigits: 1, timeOut: DRIVER_PROMPT_TIMEOUT_SECONDS },
      eventUrl: [inputUrl],
    },
  ];
}

export function conversationName(incidentId: Incident['id']): string {
  return `inc-${incidentId}`;
}

export function buildJoinConversationNcco(incidentId: Incident['id']): NccoAction[] {
  return [{ action: 'conversation', name: conversationName(incidentId) }];
}

export function buildInvalidKeyNcco(locale: Locale): NccoAction[] {
  return [
    {
      action: 'talk',
      text: getTranslator(locale)('voice.invalidKey'),
      language: toTtsLanguage(locale),
    },
  ];
}
