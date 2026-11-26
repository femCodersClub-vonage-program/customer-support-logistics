import { Phone } from 'lucide-react';
import { useTranslations } from 'use-intl';

import { useFocusOnMount } from './useFocusOnMount.ts';

export function PreCall({ onJoin }: { onJoin: () => void }) {
  const t = useTranslations('call');
  const heading = useFocusOnMount<HTMLHeadingElement>();

  return (
    <>
      <h1 ref={heading} tabIndex={-1}>
        {t('title')}
      </h1>
      <p className="call-intro">{t('intro')}</p>
      <section className="call-section" aria-labelledby="call-participants">
        <h2 id="call-participants">{t('participantsTitle')}</h2>
        <ul className="call-participants">
          <li>{t('participants.you')}</li>
          <li>{t('participants.agent')}</li>
          <li>{t('participants.driver')}</li>
        </ul>
      </section>
      <section className="call-section" aria-labelledby="call-microphone">
        <h2 id="call-microphone">{t('microphoneTitle')}</h2>
        <p>{t('microphoneIntro')}</p>
      </section>
      <div className="call-actions">
        <button type="button" className="call-primary" onClick={onJoin}>
          <Phone size={18} strokeWidth={2} aria-hidden="true" />
          {t('join')}
        </button>
      </div>
    </>
  );
}
