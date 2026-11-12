import { useTranslations } from 'next-intl';

import styles from './StatusBadge.module.css';

import type { IncidentStatus } from '@csl/shared-types';

export function StatusBadge({ status }: Readonly<{ status: IncidentStatus }>) {
  const t = useTranslations('incident.status');

  return (
    <span className={styles.badge} data-status={status}>
      {t(status)}
    </span>
  );
}
