import { getTranslator } from '../i18n/translator.js';

import { toTtsLanguage } from './locales.js';

import type { Locale, Order } from '@csl/shared-types';

export interface TalkAction {
  action: 'talk';
  text: string;
  language: string;
}

export interface InputAction {
  action: 'input';
  type: ['dtmf'];
  dtmf: { maxDigits: number; timeOut: number };
  eventUrl: [string];
}

export interface ConversationAction {
  action: 'conversation';
  name: string;
}

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
