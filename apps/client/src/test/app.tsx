import { HttpResponse, http } from 'msw';
import { MemoryRouter } from 'react-router';

import { App } from '../App.tsx';
import { SessionProvider } from '../auth/session.tsx';

import { renderWithIntl } from './render.tsx';

import type { CurrentUser } from '@csl/contracts';
import type { Locale } from '@csl/shared-types';

export const CUSTOMER: CurrentUser = {
  role: 'customer',
  id: '5eed0000-0000-4000-8000-0000000000c1',
  name: 'Lucía Martín',
};

export const apiUrl = (path: string) => new URL(`/api${path}`, window.location.origin).href;

export const apiError = (status: number, code: string) =>
  HttpResponse.json({ error: { code, message: code } }, { status });

export const sessionOf = (user: CurrentUser | null) =>
  http.get(apiUrl('/auth/me'), () =>
    user === null ? apiError(401, 'UNAUTHORIZED') : HttpResponse.json(user),
  );

export function renderApp(path: string, locale: Locale = 'en') {
  return renderWithIntl(
    <MemoryRouter initialEntries={[path]}>
      <SessionProvider>
        <App />
      </SessionProvider>
    </MemoryRouter>,
    { locale },
  );
}
