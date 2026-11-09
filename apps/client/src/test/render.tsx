import { render } from '@testing-library/react';

import { LocaleProvider } from '../i18n/LocaleProvider.tsx';

import type { Locale } from '@csl/shared-types';
import type { RenderOptions } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';

export function renderWithIntl(
  ui: ReactElement,
  { locale = 'en', ...options }: Omit<RenderOptions, 'wrapper'> & { locale?: Locale } = {},
) {
  function Wrapper({ children }: { children: ReactNode }) {
    return <LocaleProvider initialLocale={locale}>{children}</LocaleProvider>;
  }

  return render(ui, { wrapper: Wrapper, ...options });
}
