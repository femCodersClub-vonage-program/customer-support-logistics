import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useTranslations } from 'use-intl';

import '../call/call.css';
import { isCallActive } from '../call/call-state.ts';
import { CallOutcome } from '../call/CallOutcome.tsx';
import { InCall } from '../call/InCall.tsx';
import { queryMicrophonePermission } from '../call/microphone.ts';
import { MicrophoneHelp } from '../call/MicrophoneHelp.tsx';
import { PreCall } from '../call/PreCall.tsx';
import { useVonageCall } from '../call/useVonageCall.ts';
import { useWakeLock } from '../call/useWakeLock.ts';
import { useBlockInterruptions } from '../pwa/interruptions.ts';

import type { CallState } from '../call/call-state.ts';

function CallScreen({ incidentId }: { incidentId: string }) {
  const t = useTranslations('call');
  const navigate = useNavigate();
  const { state, join, hangup, toggleMute } = useVonageCall(incidentId);
  const [microphoneBlocked, setMicrophoneBlocked] = useState(false);
  const leftByCustomer = state.status === 'ended' && state.endedBy === 'local';

  useBlockInterruptions();
  useWakeLock(isCallActive(state.status));

  useEffect(() => {
    if (leftByCustomer) {
      void navigate(`/incidents/${incidentId}`, { replace: true });
    }
  }, [incidentId, leftByCustomer, navigate]);

  useEffect(() => {
    let cancelled = false;

    void queryMicrophonePermission().then((permission) => {
      if (!cancelled) {
        setMicrophoneBlocked(permission === 'denied');
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const statusText = (status: CallState['status']) =>
    status === 'idle' ? '' : t(`status.${status}`);

  const showMicrophoneHelp =
    (state.status === 'idle' && microphoneBlocked) || state.failure === 'microphone_denied';

  let screen;

  if (showMicrophoneHelp) {
    screen = <MicrophoneHelp incidentId={incidentId} onTryAgain={() => void join()} />;
  } else if (state.status === 'idle') {
    screen = <PreCall onJoin={() => void join()} />;
  } else if (isCallActive(state.status)) {
    screen = (
      <InCall state={state} onToggleMute={() => void toggleMute()} onHangUp={() => void hangup()} />
    );
  } else {
    screen = <CallOutcome incidentId={incidentId} state={state} onTryAgain={() => void join()} />;
  }

  return (
    <main className="call">
      {screen}
      <p className="call-status" role="status">
        {statusText(state.status)}
      </p>
      <p className="call-incident">{t('incident', { id: incidentId })}</p>
    </main>
  );
}

export function CallPage() {
  const { id = '' } = useParams();

  return <CallScreen key={id} incidentId={id} />;
}
