'use client';

import { useTranslations } from 'next-intl';

import { useEvents } from '../lib/events/EventsProvider';

import styles from './ConnectionStatus.module.css';

export function ConnectionStatus() {
  const t = useTranslations('topBar.connection');
  const { state } = useEvents();

  return (
    <p className={styles.status} data-state={state}>
      <span className={styles.dot} aria-hidden="true" />
      {t(state)}
    </p>
  );
}
