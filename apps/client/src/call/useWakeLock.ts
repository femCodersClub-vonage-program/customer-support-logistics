import { useEffect } from 'react';

export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) {
      return;
    }

    let sentinel: WakeLockSentinel | null = null;
    let released = false;

    const request = async () => {
      if (document.visibilityState !== 'visible' || (sentinel !== null && !sentinel.released)) {
        return;
      }

      try {
        const next = await navigator.wakeLock.request('screen');

        if (released) {
          await next.release();
          return;
        }

        sentinel = next;
      } catch {
        sentinel = null;
      }
    };

    void request();
    document.addEventListener('visibilitychange', request);

    return () => {
      released = true;
      document.removeEventListener('visibilitychange', request);
      void sentinel?.release().catch(() => undefined);
    };
  }, [active]);
}
