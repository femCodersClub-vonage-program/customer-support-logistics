import { Mic, MicOff, PhoneCall, PhoneOff } from 'lucide-react';
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
      <div className="call-active-header">
        <span className="call-active-badge" aria-hidden="true">
          <PhoneCall size={30} strokeWidth={2} />
        </span>
        <h1 ref={heading} tabIndex={-1}>
          {t('title')}
        </h1>
        {state.connectedAt !== null && (
          <p className="call-duration">
            {t('duration')}:{' '}
            <time dateTime={toIsoDuration(seconds)}>{formatDuration(seconds)}</time>
          </p>
        )}
      </div>
      <div className="call-actions">
        <button
          type="button"
          className="call-secondary"
          aria-pressed={state.muted}
          disabled={!canControl}
          onClick={onToggleMute}
        >
          {state.muted ? (
            <MicOff size={18} strokeWidth={2} aria-hidden="true" />
          ) : (
            <Mic size={18} strokeWidth={2} aria-hidden="true" />
          )}
          {t('mute')}
        </button>
        <button type="button" className="call-danger" disabled={!canControl} onClick={onHangUp}>
          <PhoneOff size={18} strokeWidth={2} aria-hidden="true" />
          {t('hangUp')}
        </button>
      </div>
    </>
  );
}
