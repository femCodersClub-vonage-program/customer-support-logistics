import { useRegisterSW } from 'virtual:pwa-register/react';

import { useInterruptionsBlocked } from './interruptions.ts';
import './pwa.css';

export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  const blocked = useInterruptionsBlocked();
  const visible = needRefresh && !blocked;

  return (
    <div className="pwa-toast-region" aria-live="polite">
      {visible && (
        <div className="pwa-card pwa-card--toast">
          <p className="pwa-card__title">New version available</p>
          <p>Reload to get the latest version of the app.</p>
          <div className="pwa-card__actions">
            <button type="button" className="pwa-button" onClick={() => void updateServiceWorker()}>
              Reload
            </button>
            <button
              type="button"
              className="pwa-button pwa-button--secondary"
              onClick={() => setNeedRefresh(false)}
            >
              Later
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
