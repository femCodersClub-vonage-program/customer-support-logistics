import type { Messages } from './messages.ts';
import type { Locale } from '@csl/shared-types';

declare module 'use-intl' {
  interface AppConfig {
    Locale: Locale;
    Messages: Messages;
  }
}
