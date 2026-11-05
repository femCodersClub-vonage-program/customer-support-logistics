import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OfflineBanner } from './OfflineBanner.tsx';

const OFFLINE_MESSAGE =
  'You’re offline. Some information may be out of date until your connection comes back.';

function goOffline(offline: boolean) {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(!offline);

  act(() => {
    window.dispatchEvent(new Event(offline ? 'offline' : 'online'));
  });
}

describe('OfflineBanner', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stays hidden while online', () => {
    render(<OfflineBanner />);

    expect(screen.queryByText(OFFLINE_MESSAGE)).not.toBeInTheDocument();
  });

  it('shows the message when the connection drops and hides it when it comes back', () => {
    render(<OfflineBanner />);

    goOffline(true);
    expect(screen.getByText(OFFLINE_MESSAGE)).toBeInTheDocument();

    goOffline(false);
    expect(screen.queryByText(OFFLINE_MESSAGE)).not.toBeInTheDocument();
  });
});
