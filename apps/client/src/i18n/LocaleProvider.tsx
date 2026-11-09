import { useCallback, useEffect, useMemo, useState } from 'react';
import { IntlProvider } from 'use-intl';

import { detectLocale, LocaleContext, storeLocale } from './locale.ts';
import { getMessages } from './messages.ts';

import type { Locale } from '@csl/shared-types';
import type { ReactNode } from 'react';

const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

export function LocaleProvider({
  children,
  initialLocale,
}: {
  children: ReactNode;
  initialLocale?: Locale;
}) {
  const [locale, setLocale] = useState<Locale>(() => initialLocale ?? detectLocale());

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const changeLocale = useCallback((next: Locale) => {
    storeLocale(next);
    setLocale(next);
  }, []);

  const value = useMemo(() => ({ locale, setLocale: changeLocale }), [locale, changeLocale]);
  const messages = useMemo(() => getMessages(locale), [locale]);

  return (
    <LocaleContext value={value}>
      <IntlProvider locale={locale} messages={messages} timeZone={timeZone}>
        {children}
      </IntlProvider>
    </LocaleContext>
  );
}
