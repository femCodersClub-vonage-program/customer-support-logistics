import { act, fireEvent, render, screen } from '@testing-library/react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useBlockInterruptions } from './interruptions.ts';
import { InterruptionsProvider } from './InterruptionsProvider.tsx';
import { UpdatePrompt } from './UpdatePrompt.tsx';

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: vi.fn(),
}));

const setNeedRefresh = vi.fn();
const setOfflineReady = vi.fn();
const updateServiceWorker = vi.fn().mockResolvedValue(undefined);

function mockRegisterSW(needRefresh: boolean) {
  vi.mocked(useRegisterSW).mockReturnValue({
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [false, setOfflineReady],
    updateServiceWorker,
  });
}

function BlockingRoute() {
  useBlockInterruptions();

  return null;
}

describe('UpdatePrompt', () => {
  beforeEach(() => {
    mockRegisterSW(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('stays hidden when there is no new version', () => {
    mockRegisterSW(false);
    render(<UpdatePrompt />);

    expect(screen.queryByText('New version available')).not.toBeInTheDocument();
  });

  it('reloads with the new version when the user asks for it', async () => {
    render(<UpdatePrompt />);

    expect(screen.getByText('New version available')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    });

    expect(updateServiceWorker).toHaveBeenCalledOnce();
  });

  it('can be postponed without reloading', async () => {
    render(<UpdatePrompt />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Later' }));
    });

    expect(setNeedRefresh).toHaveBeenCalledWith(false);
    expect(updateServiceWorker).not.toHaveBeenCalled();
  });

  it('stays hidden while interruptions are blocked', () => {
    render(
      <InterruptionsProvider>
        <BlockingRoute />
        <UpdatePrompt />
      </InterruptionsProvider>,
    );

    expect(screen.queryByText('New version available')).not.toBeInTheDocument();
  });
});
