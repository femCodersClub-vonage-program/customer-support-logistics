import { Link } from 'react-router';
import { useTranslations } from 'use-intl';

import { useFocusOnMount } from './useFocusOnMount.ts';

import type { CallFailure, CallState } from './call-state.ts';

const FAILURE_MESSAGES = {
  not_available: 'errors.notAvailable',
  no_connection: 'errors.noConnection',
  session_expired: 'errors.sessionExpired',
  microphone_unavailable: 'errors.microphoneUnavailable',
  microphone_denied: 'errors.generic',
  unknown: 'errors.generic',
} as const satisfies Record<CallFailure, string>;

interface CallOutcomeProps {
  incidentId: string;
  state: CallState;
  onTryAgain: () => void;
}

export function CallOutcome({ incidentId, state, onTryAgain }: CallOutcomeProps) {
  const t = useTranslations('call');
  const heading = useFocusOnMount<HTMLHeadingElement>();
  const ended = state.status === 'ended';
  const canTryAgain = !ended && state.failure !== 'not_available';

  return (
    <>
      <h1 ref={heading} tabIndex={-1}>
        {ended ? t('ended.title') : t('status.failed')}
      </h1>
      <p>
        {ended
          ? t(state.endedBy === 'local' ? 'ended.byYou' : 'ended.byRemote')
          : t(FAILURE_MESSAGES[state.failure ?? 'unknown'])}
      </p>
      <div className="call-actions">
        {canTryAgain && (
          <button type="button" className="call-primary" onClick={onTryAgain}>
            {t('tryAgain')}
          </button>
        )}
        <Link className="call-link" to={`/incidents/${incidentId}`}>
          {t('backToIncident')}
        </Link>
      </div>
    </>
  );
}
