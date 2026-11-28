import { useTranslations } from 'next-intl';

import { isCallActive } from '../lib/call/call-state';
import { formatDuration, toIsoDuration, useCallDuration } from '../lib/call/useCallDuration';

import styles from './MediationCall.module.css';

import type { CallState } from '../lib/call/call-state';

interface CallControlsProps {
  call: CallState;
  onToggleMute: () => void;
  onLeave: () => void;
  onEndForAll: () => void;
}

export function CallControls({
  call,
  onToggleMute,
  onLeave,
  onEndForAll,
}: Readonly<CallControlsProps>) {
  const t = useTranslations('mediation.call.controls');
  const seconds = useCallDuration(call.connectedAt);
  const active = isCallActive(call.status);

  return (
    <div className={styles.controls}>
      {active && (
        <>
          <button
            type="button"
            className={styles.secondaryButton}
            aria-pressed={call.muted}
            onClick={onToggleMute}
          >
            {t('mute')}
          </button>
          <button type="button" className={styles.secondaryButton} onClick={onLeave}>
            {t('leave')}
          </button>
        </>
      )}
      <button type="button" className={styles.dangerButton} onClick={onEndForAll}>
        {t('endForAll')}
      </button>
      {active && call.connectedAt !== null && (
        // Outside the live region on purpose, so that it is not read every second.
        <p className={styles.duration}>
          {t('duration')} <time dateTime={toIsoDuration(seconds)}>{formatDuration(seconds)}</time>
        </p>
      )}
      {active && call.muted && <p className={styles.mutedNote}>{t('muted')}</p>}
    </div>
  );
}
