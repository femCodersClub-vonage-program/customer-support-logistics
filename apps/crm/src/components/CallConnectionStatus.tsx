import { useTranslations } from 'next-intl';

import styles from './MediationCall.module.css';

import type { CallState } from '../lib/call/call-state';

const FAILURE_KEYS = {
  microphone_denied: 'microphoneDenied',
  microphone_unavailable: 'microphoneUnavailable',
  not_available: 'notAvailable',
  no_connection: 'noConnection',
  session_expired: 'sessionExpired',
  unknown: 'generic',
} as const;

export function CallConnectionStatus({ call }: Readonly<{ call: CallState }>) {
  const t = useTranslations('mediation.call');
  const failure = call.status === 'failed' ? call.failure : null;

  // The region is always there, so that screen readers announce each change of its text.
  // A failure is described by the message under it, not by the status itself.
  return (
    <div className={styles.statusBlock}>
      <p role="status" className={styles.status} data-state={call.status}>
        <span className={styles.dot} aria-hidden="true" />
        {t(`status.${call.status}`)}
      </p>
      {failure !== null && failure !== 'microphone_denied' && (
        <p role="alert" className={styles.error}>
          {t(`errors.${FAILURE_KEYS[failure]}`)}
        </p>
      )}
    </div>
  );
}
