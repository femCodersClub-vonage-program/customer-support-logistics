import { SideNav } from '../components/SideNav';
import { TopBar } from '../components/TopBar';
import '../styles/tokens.css';
import '../styles/global.css';

import styles from './layout.module.css';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'CSL Support CRM',
  description: 'Inbox, incident files and mediation console for support agents.',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className={styles.shell}>
          <TopBar />
          <SideNav />
          <main className={styles.content}>{children}</main>
        </div>
      </body>
    </html>
  );
}
