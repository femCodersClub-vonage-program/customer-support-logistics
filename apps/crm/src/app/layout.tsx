import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';

import { SideNav } from '../components/SideNav';
import { TopBar } from '../components/TopBar';
import '../styles/tokens.css';
import '../styles/global.css';

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

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider>
          <div className={styles.shell}>
            <TopBar />
            <SideNav />
            <main className={styles.content}>{children}</main>
          </div>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
