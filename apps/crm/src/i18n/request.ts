import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';

import { LOCALE_COOKIE, resolveLocale, TIME_ZONE } from './locale';
import { getMessages } from './messages';

export default getRequestConfig(async () => {
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()]);
  const locale = resolveLocale(
    cookieStore.get(LOCALE_COOKIE)?.value,
    headerList.get('accept-language'),
  );

  return { locale, messages: getMessages(locale), timeZone: TIME_ZONE };
});
