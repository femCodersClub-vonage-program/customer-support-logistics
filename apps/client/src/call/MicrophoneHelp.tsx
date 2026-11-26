import { Link } from 'react-router';
import { useTranslations } from 'use-intl';

import { useFocusOnMount } from './useFocusOnMount.ts';

interface MicrophoneHelpProps {
  incidentId: string;
  onTryAgain: () => void;
}

export function MicrophoneHelp({ incidentId, onTryAgain }: MicrophoneHelpProps) {
  const t = useTranslations('call');
  const heading = useFocusOnMount<HTMLHeadingElement>();

  return (
    <>
      <h1 ref={heading} tabIndex={-1}>
        {t('microphoneHelp.title')}
      </h1>
      <p className="call-intro">{t('microphoneHelp.intro')}</p>
      <section className="call-section" aria-labelledby="call-help-chrome">
        <h2 id="call-help-chrome">{t('microphoneHelp.chromeTitle')}</h2>
        <ol>
          <li>{t('microphoneHelp.chromeStep1')}</li>
          <li>{t('microphoneHelp.chromeStep2')}</li>
          <li>{t('microphoneHelp.chromeStep3')}</li>
        </ol>
      </section>
      <section className="call-section" aria-labelledby="call-help-safari">
        <h2 id="call-help-safari">{t('microphoneHelp.safariTitle')}</h2>
        <ol>
          <li>{t('microphoneHelp.safariStep1')}</li>
          <li>{t('microphoneHelp.safariStep2')}</li>
          <li>{t('microphoneHelp.safariStep3')}</li>
        </ol>
      </section>
      <div className="call-actions">
        <button type="button" className="call-primary" onClick={onTryAgain}>
          {t('tryAgain')}
        </button>
        <Link className="call-link" to={`/incidents/${incidentId}`}>
          {t('backToIncident')}
        </Link>
      </div>
    </>
  );
}
