import { cookies } from 'next/headers';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';

import { SideNav } from '../components/SideNav';
import { TopBar } from '../components/TopBar';
import { EventsProvider } from '../lib/events/EventsProvider';
import { SESSION_COOKIE } from '../lib/session';
import '@csl/design-tokens';

import styles from './layout.module.css';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('metadata');

  return {
    title: t('title'),
    description: t('description'),
  };
}

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const locale = await getLocale();
  const signedIn = (await cookies()).has(SESSION_COOKIE);

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider>
          {signedIn ? (
            <EventsProvider>
              <div className={styles.shell}>
                <TopBar />
                <SideNav />
                <main className={styles.content}>{children}</main>
              </div>
            </EventsProvider>
          ) : (
            children
          )}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
