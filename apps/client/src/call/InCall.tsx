import { useTranslations } from 'use-intl';

import { formatDuration, toIsoDuration, useCallDuration } from './useCallDuration.ts';
import { useFocusOnMount } from './useFocusOnMount.ts';

import type { CallState } from './call-state.ts';

interface InCallProps {
  state: CallState;
  onToggleMute: () => void;
  onHangUp: () => void;
}

export function InCall({ state, onToggleMute, onHangUp }: InCallProps) {
  const t = useTranslations('call');
  const heading = useFocusOnMount<HTMLHeadingElement>();
  const seconds = useCallDuration(state.connectedAt);
  const canControl = state.callId !== null;

  return (
    <>
      <h1 ref={heading} tabIndex={-1}>
        {t('title')}
      </h1>
      {state.connectedAt !== null && (
        <p className="call-duration">
          {t('duration')}: <time dateTime={toIsoDuration(seconds)}>{formatDuration(seconds)}</time>
        </p>
      )}
      <div className="call-actions">
        <button
          type="button"
          className="call-secondary"
          aria-pressed={state.muted}
          disabled={!canControl}
          onClick={onToggleMute}
        >
          {t('mute')}
        </button>
        <button type="button" className="call-danger" disabled={!canControl} onClick={onHangUp}>
          {t('hangUp')}
        </button>
      </div>
    </>
  );
}
