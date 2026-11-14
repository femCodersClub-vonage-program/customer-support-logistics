import { afterEach, describe, expect, it, vi } from 'vitest';

import { DatabaseHealth } from './database.health.js';

import type { Database } from './database.constants.js';

function healthWith(execute: () => Promise<unknown>): DatabaseHealth {
  return new DatabaseHealth({ execute } as unknown as Database);
}

describe('DatabaseHealth', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is up when the query succeeds', async () => {
    await expect(healthWith(() => Promise.resolve({ rows: [] })).isUp()).resolves.toBe(true);
  });

  it('is down when the query fails', async () => {
    const health = healthWith(() => Promise.reject(new Error('connect ECONNREFUSED')));

    await expect(health.isUp()).resolves.toBe(false);
  });

  it('is down when the query takes longer than the timeout', async () => {
    vi.useFakeTimers();
    const result = healthWith(() => new Promise(() => {})).isUp(100);

    await vi.advanceTimersByTimeAsync(100);

    await expect(result).resolves.toBe(false);
  });
});
