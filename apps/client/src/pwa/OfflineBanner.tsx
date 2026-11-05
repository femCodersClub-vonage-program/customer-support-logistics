import { useSyncExternalStore } from 'react';

import './pwa.css';

function subscribe(listener: () => void) {
  window.addEventListener('online', listener);
  window.addEventListener('offline', listener);

  return () => {
    window.removeEventListener('online', listener);
    window.removeEventListener('offline', listener);
  };
}

function getOnline() {
  return navigator.onLine;
}

export function OfflineBanner() {
  const online = useSyncExternalStore(subscribe, getOnline);

  return (
    <div aria-live="polite">
      {!online && (
        <p className="offline-banner">
          You’re offline. Some information may be out of date until your connection comes back.
        </p>
      )}
    </div>
  );
}
