import { useTranslations } from 'next-intl';

import styles from './MediationPanel.module.css';

import type { MediationError as MediationErrorCode } from '../lib/mediation';

export function MediationError({ error }: Readonly<{ error: MediationErrorCode | null }>) {
  const t = useTranslations('mediation.errors');

  if (error === null) {
    return null;
  }

  return (
    <p role="alert" className={styles.error}>
      {t(error)}
    </p>
  );
}
