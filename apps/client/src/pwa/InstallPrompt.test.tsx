import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithIntl } from '../test/render.tsx';

import { DISMISS_DURATION_MS, DISMISSED_AT_KEY, listenForInstallPrompt } from './installPrompt.ts';
import { InstallPrompt } from './InstallPrompt.tsx';
import { useBlockInterruptions } from './interruptions.ts';
import { InterruptionsProvider } from './InterruptionsProvider.tsx';

const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1';

const INSTALL_PROMPT_NAME = 'Install the app';

let stopListening: () => void;

function queryInstallPrompt() {
  return screen.queryByRole('complementary', { name: INSTALL_PROMPT_NAME });
}

function setUserAgent(userAgent: string) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent);
}

function setStandalone(standalone: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: standalone && query === '(display-mode: standalone)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

function fireBeforeInstallPrompt(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const event = new Event('beforeinstallprompt', { cancelable: true });
  const prompt = vi.fn().mockResolvedValue(undefined);
  Object.assign(event, {
    prompt,
    userChoice: Promise.resolve({ outcome, platform: 'web' }),
  });

  act(() => {
    window.dispatchEvent(event);
  });

  return { event, prompt };
}

function BlockingRoute() {
  useBlockInterruptions();

  return null;
}

describe('InstallPrompt', () => {
  beforeEach(() => {
    localStorage.clear();
    setUserAgent(ANDROID_CHROME);
    setStandalone(false);
    stopListening = listenForInstallPrompt();
  });

  afterEach(() => {
    stopListening();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('stays hidden until the browser offers an install prompt', () => {
    renderWithIntl(<InstallPrompt />);

    expect(queryInstallPrompt()).not.toBeInTheDocument();
  });

  it('shows the install button and opens the native dialog', async () => {
    renderWithIntl(<InstallPrompt />);

    const { event, prompt } = fireBeforeInstallPrompt();

    expect(event.defaultPrevented).toBe(true);
    expect(screen.getByRole('complementary', { name: INSTALL_PROMPT_NAME })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Install' }));
    });

    expect(prompt).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Install' })).not.toBeInTheDocument();
  });

  it('remembers when the user cancels the native dialog', async () => {
    renderWithIntl(<InstallPrompt />);
    fireBeforeInstallPrompt('dismissed');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Install' }));
    });

    expect(localStorage.getItem(DISMISSED_AT_KEY)).not.toBeNull();
  });

  it('hides after the app is installed', () => {
    renderWithIntl(<InstallPrompt />);
    fireBeforeInstallPrompt();

    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });

    expect(queryInstallPrompt()).not.toBeInTheDocument();
  });

  it('stays hidden when the app is already running standalone', () => {
    setStandalone(true);
    renderWithIntl(<InstallPrompt />);
    fireBeforeInstallPrompt();

    expect(queryInstallPrompt()).not.toBeInTheDocument();
  });

  it('hides after dismissing and stays hidden on the next visit', async () => {
    const { unmount } = renderWithIntl(<InstallPrompt />);
    fireBeforeInstallPrompt();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    });

    expect(queryInstallPrompt()).not.toBeInTheDocument();

    unmount();
    renderWithIntl(<InstallPrompt />);

    expect(queryInstallPrompt()).not.toBeInTheDocument();
  });

  it('shows again once the dismissal has expired', () => {
    localStorage.setItem(DISMISSED_AT_KEY, String(Date.now() - DISMISS_DURATION_MS - 1));
    renderWithIntl(<InstallPrompt />);
    fireBeforeInstallPrompt();

    expect(screen.getByRole('complementary', { name: INSTALL_PROMPT_NAME })).toBeInTheDocument();
  });

  it('shows the Add to Home Screen steps on iOS Safari', () => {
    setUserAgent(IPHONE_SAFARI);
    renderWithIntl(<InstallPrompt />);

    expect(screen.getByRole('complementary', { name: INSTALL_PROMPT_NAME })).toBeInTheDocument();
    expect(screen.getByText('Choose “Add to Home Screen”.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Install' })).not.toBeInTheDocument();
  });

  it('does not show the iOS steps in other iOS browsers', () => {
    setUserAgent(IPHONE_CHROME);
    renderWithIntl(<InstallPrompt />);

    expect(queryInstallPrompt()).not.toBeInTheDocument();
  });

  it('stays hidden while interruptions are blocked', () => {
    renderWithIntl(
      <InterruptionsProvider>
        <BlockingRoute />
        <InstallPrompt />
      </InterruptionsProvider>,
    );
    fireBeforeInstallPrompt();

    expect(queryInstallPrompt()).not.toBeInTheDocument();
  });
});
