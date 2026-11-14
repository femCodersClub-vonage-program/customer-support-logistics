import { useTranslations } from 'next-intl';

import type { Locale } from '@csl/shared-types';

interface ContactLanguageProps {
  role: 'customer' | 'driver';
  locale: Locale;
}

export function ContactLanguage({ role, locale }: ContactLanguageProps) {
  const t = useTranslations();

  return <p>{t(`contactLanguage.${role}`, { language: t(`localeName.${locale}`) })}</p>;
}
