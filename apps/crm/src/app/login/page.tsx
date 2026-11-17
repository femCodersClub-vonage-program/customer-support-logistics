import { getTranslations } from 'next-intl/server';

import { LocaleSwitcher } from '../../components/LocaleSwitcher';
import { LoginForm } from '../../components/LoginForm';
import { safeNextPath } from '../../lib/next-path';

import styles from './page.module.css';

export default async function LoginPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ next?: string | string[] }> }>) {
  const t = await getTranslations('login');
  const { next } = await searchParams;

  return (
    <main className={styles.page}>
      <div className={styles.toolbar}>
        <LocaleSwitcher />
      </div>
      <h1>{t('title')}</h1>
      <LoginForm next={safeNextPath(typeof next === 'string' ? next : undefined)} />
    </main>
  );
}
