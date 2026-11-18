import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useWakeLock } from './useWakeLock.ts';

function createSentinel() {
  const sentinel = {
    released: false,
    release: vi.fn(async () => {
      sentinel.released = true;
    }),
  };

  return sentinel;
}

let sentinels: ReturnType<typeof createSentinel>[] = [];

const request = vi.fn(async () => {
  const sentinel = createSentinel();
  sentinels.push(sentinel);
  return sentinel as unknown as WakeLockSentinel;
});

const setVisibility = (state: DocumentVisibilityState) => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state });
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
};

beforeEach(() => {
  sentinels = [];
  Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } });
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
});

afterEach(() => {
  vi.clearAllMocks();
  Reflect.deleteProperty(navigator, 'wakeLock');
  Reflect.deleteProperty(document, 'visibilityState');
});

describe('useWakeLock', () => {
  it('keeps the screen awake while active', async () => {
    renderHook(() => useWakeLock(true));

    await waitFor(() => expect(request).toHaveBeenCalledWith('screen'));
  });

  it('does nothing while inactive', () => {
    renderHook(() => useWakeLock(false));

    expect(request).not.toHaveBeenCalled();
  });

  it('lets the screen sleep again once inactive', async () => {
    const { rerender } = renderHook(({ active }) => useWakeLock(active), {
      initialProps: { active: true },
    });

    await waitFor(() => expect(sentinels).toHaveLength(1));
    rerender({ active: false });

    expect(sentinels[0]?.release).toHaveBeenCalled();
  });

  it('asks again when the page is visible again after the browser released the lock', async () => {
    renderHook(() => useWakeLock(true));

    await waitFor(() => expect(sentinels).toHaveLength(1));
    sentinels[0]!.released = true;
    setVisibility('hidden');
    setVisibility('visible');

    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  });

  it('does not fail when the browser refuses the lock', async () => {
    request.mockRejectedValueOnce(new DOMException('Not allowed', 'NotAllowedError'));

    renderHook(() => useWakeLock(true));

    await waitFor(() => expect(request).toHaveBeenCalled());
  });

  it('does nothing when the browser has no Wake Lock API', () => {
    Reflect.deleteProperty(navigator, 'wakeLock');

    expect(() => renderHook(() => useWakeLock(true))).not.toThrow();
  });
});
