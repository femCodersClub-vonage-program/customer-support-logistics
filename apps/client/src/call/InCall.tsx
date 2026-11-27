import { AudioLines, Lock, Mic, MicOff, PhoneOff, Smartphone } from 'lucide-react';
import { useTranslations } from 'use-intl';

import { useSession } from '../auth/session-context.ts';

import { formatDuration, toIsoDuration, useCallDuration } from './useCallDuration.ts';
import { useFocusOnMount } from './useFocusOnMount.ts';

import type { CallState } from './call-state.ts';

interface InCallProps {
  state: CallState;
  onToggleMute: () => void;
  onHangUp: () => void;
}

function initialOf(name: string | undefined, fallback: string): string {
  const first = name?.trim()[0];

  return first ? first.toUpperCase() : fallback;
}

export function InCall({ state, onToggleMute, onHangUp }: InCallProps) {
  const t = useTranslations('call');
  const { state: session } = useSession();
  const heading = useFocusOnMount<HTMLHeadingElement>();
  const seconds = useCallDuration(state.connectedAt);
  const canControl = state.callId !== null;
  const userInitial = initialOf(
    session.status === 'ready' ? session.user?.name : undefined,
    initialOf(t('inCallParticipants.you'), 'Y'),
  );

  return (
    <div className="call-in-call">
      <div className="call-active-header">
        <p className="call-privacy">
          <Lock size={14} strokeWidth={2} aria-hidden="true" />
          <span>{t('privacy')}</span>
        </p>
        <h1 ref={heading} tabIndex={-1}>
          {t('title')}
        </h1>
        {state.connectedAt !== null && (
          <p className="call-duration">
            <span className="visually-hidden">{t('duration')}: </span>
            <time dateTime={toIsoDuration(seconds)}>{formatDuration(seconds)}</time>
          </p>
        )}
      </div>

      <ul className="call-stage" aria-label={t('participantsTitle')}>
        <li className="call-stage__card call-stage__card--highlight">
          <span className="call-stage__avatar call-stage__avatar--primary" aria-hidden="true">
            {initialOf(t('inCallParticipants.support'), 'S')}
          </span>
          <div className="call-stage__info">
            <p className="call-stage__name">{t('inCallParticipants.support')}</p>
            <p className="call-stage__role">{t('inCallParticipants.supportRole')}</p>
          </div>
          <AudioLines
            size={20}
            strokeWidth={2}
            className="call-stage__indicator"
            aria-hidden="true"
          />
        </li>

        <li className="call-stage__card">
          <span className="call-stage__avatar" aria-hidden="true">
            {initialOf(t('inCallParticipants.driver'), 'D')}
          </span>
          <div className="call-stage__info">
            <p className="call-stage__name">{t('inCallParticipants.driver')}</p>
            <p className="call-stage__role">{t('inCallParticipants.driverRole')}</p>
          </div>
          <Smartphone size={18} strokeWidth={2} className="call-stage__icon" aria-hidden="true" />
        </li>

        <li className="call-stage__card">
          <span className="call-stage__avatar" aria-hidden="true">
            {userInitial}
          </span>
          <div className="call-stage__info">
            <p className="call-stage__name">{t('inCallParticipants.you')}</p>
            <p className="call-stage__role">
              {state.muted ? t('inCallParticipants.micMuted') : t('inCallParticipants.micActive')}
            </p>
          </div>
        </li>
      </ul>

      <div className="call-footer">
        <p className="call-evidence-note">{t('evidenceNote')}</p>

        <div className="call-controls">
          <button
            type="button"
            className="call-control call-control--mute"
            aria-pressed={state.muted}
            disabled={!canControl}
            onClick={onToggleMute}
          >
            <span className="call-control__circle" aria-hidden="true">
              {state.muted ? (
                <MicOff size={24} strokeWidth={2} />
              ) : (
                <Mic size={24} strokeWidth={2} />
              )}
            </span>
            <span className="call-control__label">{t('mute')}</span>
          </button>

          <button
            type="button"
            className="call-control call-control--danger"
            disabled={!canControl}
            onClick={onHangUp}
          >
            <span className="call-control__circle" aria-hidden="true">
              <PhoneOff size={24} strokeWidth={2} />
            </span>
            <span className="call-control__label">{t('hangUp')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
