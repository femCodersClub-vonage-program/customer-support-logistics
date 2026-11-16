import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PendingVerifications, VERIFICATION_TTL_MS } from './pending-verifications.js';

const CUSTOMER_ID = '0b9f1c9e-8a43-4d1e-9a51-3f3c2b8a7d10';

describe('PendingVerifications', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('finds the customer of a verification until it expires', () => {
    const pending = new PendingVerifications();
    pending.add('req-1', CUSTOMER_ID);

    vi.advanceTimersByTime(VERIFICATION_TTL_MS - 1);
    expect(pending.find('req-1')).toMatchObject({ customerId: CUSTOMER_ID });

    vi.advanceTimersByTime(1);
    expect(pending.find('req-1')).toBeUndefined();
  });

  it('keeps verifications for unknown phones, without a customer', () => {
    const pending = new PendingVerifications();
    pending.add('req-1', null);

    expect(pending.find('req-1')).toMatchObject({ customerId: null });
  });

  it('counts the checks of each verification', () => {
    const pending = new PendingVerifications();
    pending.add('req-1', null);
    pending.add('req-2', null);

    pending.countCheck('req-1');

    expect(pending.countCheck('req-1')).toBe(2);
    expect(pending.countCheck('req-2')).toBe(1);
    expect(pending.countCheck('unknown')).toBe(0);
  });

  it('forgets a removed verification', () => {
    const pending = new PendingVerifications();
    pending.add('req-1', CUSTOMER_ID);
    pending.remove('req-1');

    expect(pending.find('req-1')).toBeUndefined();
  });

  it('drops expired verifications when a new one is added', () => {
    const pending = new PendingVerifications();
    const deleteSpy = vi.spyOn(Map.prototype, 'delete');
    pending.add('req-1', CUSTOMER_ID);

    vi.advanceTimersByTime(VERIFICATION_TTL_MS);
    pending.add('req-2', CUSTOMER_ID);

    expect(deleteSpy).toHaveBeenCalledWith('req-1');
    deleteSpy.mockRestore();
  });
});
