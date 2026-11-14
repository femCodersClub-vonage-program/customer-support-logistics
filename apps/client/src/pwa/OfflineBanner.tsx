import { useSyncExternalStore } from 'react';
import { useTranslations } from 'use-intl';

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
  const t = useTranslations('offline');

  return (
    <div aria-live="polite">{!online && <p className="offline-banner">{t('message')}</p>}</div>
  );
}
