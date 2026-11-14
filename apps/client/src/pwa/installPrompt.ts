import { useCallback, useState, useSyncExternalStore } from 'react';

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

export type InstallPromptMode = 'hidden' | 'native' | 'ios-hint';

type InstallPromptSnapshot = {
  deferredPrompt: BeforeInstallPromptEvent | null;
  installed: boolean;
};

export const DISMISSED_AT_KEY = 'csl:install-prompt-dismissed-at';
export const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

const initialSnapshot: InstallPromptSnapshot = { deferredPrompt: null, installed: false };

let snapshot = initialSnapshot;
const listeners = new Set<() => void>();

function setSnapshot(next: Partial<InstallPromptSnapshot>) {
  snapshot = { ...snapshot, ...next };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return snapshot;
}

export function listenForInstallPrompt() {
  const handleBeforeInstallPrompt = (event: Event) => {
    event.preventDefault();
    setSnapshot({ deferredPrompt: event as BeforeInstallPromptEvent });
  };

  const handleAppInstalled = () => {
    setSnapshot({ deferredPrompt: null, installed: true });
  };

  window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  window.addEventListener('appinstalled', handleAppInstalled);

  return () => {
    window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.removeEventListener('appinstalled', handleAppInstalled);
    setSnapshot(initialSnapshot);
  };
}

function isStandalone() {
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };

  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    navigatorWithStandalone.standalone === true
  );
}

function isIosSafari() {
  const { userAgent, maxTouchPoints } = navigator;
  const isIos =
    /iPad|iPhone|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
  const isSafari = /Safari/.test(userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(userAgent);

  return isIos && isSafari;
}

function isDismissed() {
  try {
    const dismissedAt = Number(localStorage.getItem(DISMISSED_AT_KEY));

    return dismissedAt > 0 && Date.now() - dismissedAt < DISMISS_DURATION_MS;
  } catch {
    return false;
  }
}

function rememberDismissal() {
  try {
    localStorage.setItem(DISMISSED_AT_KEY, String(Date.now()));
  } catch {
    return;
  }
}

export function useInstallPrompt() {
  const { deferredPrompt, installed } = useSyncExternalStore(subscribe, getSnapshot);
  const [standalone] = useState(isStandalone);
  const [iosSafari] = useState(isIosSafari);
  const [dismissed, setDismissed] = useState(isDismissed);

  let mode: InstallPromptMode = 'hidden';

  if (!installed && !standalone && !dismissed) {
    if (deferredPrompt) {
      mode = 'native';
    } else if (iosSafari) {
      mode = 'ios-hint';
    }
  }

  const dismiss = useCallback(() => {
    rememberDismissal();
    setDismissed(true);
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) {
      return;
    }

    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setSnapshot({ deferredPrompt: null });

    if (outcome === 'dismissed') {
      dismiss();
    }
  }, [deferredPrompt, dismiss]);

  return { mode, install, dismiss };
}
