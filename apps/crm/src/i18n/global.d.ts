import type { Messages } from './messages';
import type { Locale } from '@csl/shared-types';

declare module 'next-intl' {
  interface AppConfig {
    Locale: Locale;
    Messages: Messages;
  }
}
