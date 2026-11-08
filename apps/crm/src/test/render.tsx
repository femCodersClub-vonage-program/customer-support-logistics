import { render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import { TIME_ZONE } from '../i18n/locale';
import { getMessages } from '../i18n/messages';

import type { Locale } from '@csl/shared-types';
import type { RenderOptions } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';

export function renderWithIntl(
  ui: ReactElement,
  { locale = 'en', ...options }: Omit<RenderOptions, 'wrapper'> & { locale?: Locale } = {},
) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <NextIntlClientProvider locale={locale} messages={getMessages(locale)} timeZone={TIME_ZONE}>
        {children}
      </NextIntlClientProvider>
    );
  }

  return render(ui, { wrapper: Wrapper, ...options });
}
