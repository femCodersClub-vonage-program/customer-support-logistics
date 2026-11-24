'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { api } from '../lib/api';

import styles from './TopBar.module.css';

export function LogoutButton() {
  const t = useTranslations('topBar');
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const logOut = async () => {
    setLeaving(true);
    setFailed(false);

    try {
      await api.logout();
    } catch {
      setFailed(true);
      setLeaving(false);
      return;
    }

    router.replace('/login');
    router.refresh();
  };

  return (
    <>
      <span role="alert" className={styles.logOutError}>
        {failed && t('logOutFailed')}
      </span>
      <button type="button" className={styles.logOut} onClick={logOut} disabled={leaving}>
        {t('logOut')}
      </button>
    </>
  );
}
