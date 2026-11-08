import type { Locale } from './locale.js';

export interface Driver {
  id: string;
  name: string;
  phone: string;
  active: boolean;
  locale: Locale;
}
