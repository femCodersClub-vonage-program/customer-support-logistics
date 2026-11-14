import type { Locale } from './locale.js';

export interface Customer {
  id: string;
  name: string;
  phone: string;
  phoneVerifiedAt: string | null;
  locale: Locale;
}
