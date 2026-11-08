import { useTranslations } from 'use-intl';
import { useRegisterSW } from 'virtual:pwa-register/react';

import { useInterruptionsBlocked } from './interruptions.ts';
import './pwa.css';

export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  const blocked = useInterruptionsBlocked();
  const t = useTranslations('update');
  const visible = needRefresh && !blocked;

  return (
    <div className="pwa-toast-region" aria-live="polite">
      {visible && (
        <div className="pwa-card pwa-card--toast">
          <p className="pwa-card__title">{t('title')}</p>
          <p>{t('description')}</p>
          <div className="pwa-card__actions">
            <button type="button" className="pwa-button" onClick={() => void updateServiceWorker()}>
              {t('reload')}
            </button>
            <button
              type="button"
              className="pwa-button pwa-button--secondary"
              onClick={() => setNeedRefresh(false)}
            >
              {t('later')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
