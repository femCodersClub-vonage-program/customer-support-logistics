import { Reflector } from '@nestjs/core';
import { ThrottlerStorageService } from '@nestjs/throttler';
import { describe, expect, it, vi } from 'vitest';

import { PhoneThrottlerGuard } from './phone-throttler.guard.js';

import type { ThrottlerModuleOptions } from '@nestjs/throttler';

class ExposedPhoneThrottlerGuard extends PhoneThrottlerGuard {
  trackerOf(request: Record<string, unknown>): Promise<string> {
    return this.getTracker(request);
  }

  writeHeader(response: Record<string, unknown>): void {
    this.setResponseHeader(response, 'X-RateLimit-Remaining', 7);
  }
}

const guard = new ExposedPhoneThrottlerGuard(
  [] as ThrottlerModuleOptions,
  new ThrottlerStorageService(),
  new Reflector(),
);

describe('PhoneThrottlerGuard', () => {
  it('counts requests per phone, whatever the IP', async () => {
    await expect(
      guard.trackerOf({ ip: '1.1.1.1', body: { phone: ' +34600000001 ' } }),
    ).resolves.toBe('phone:+34600000001');
    await expect(guard.trackerOf({ ip: '2.2.2.2', body: { phone: '+34600000001' } })).resolves.toBe(
      'phone:+34600000001',
    );
  });

  it('writes no rate limit headers, which would tell anyone how often a phone was used', () => {
    const header = vi.fn();

    guard.writeHeader({ header });

    expect(header).not.toHaveBeenCalled();
  });

  it('counts requests without a phone by IP', async () => {
    await expect(guard.trackerOf({ ip: '1.1.1.1', body: {} })).resolves.toBe('1.1.1.1');
    await expect(guard.trackerOf({ ip: '2.2.2.2', body: { phone: 34600000001 } })).resolves.toBe(
      '2.2.2.2',
    );
    await expect(guard.trackerOf({ ip: '3.3.3.3', body: { phone: '  ' } })).resolves.toBe(
      '3.3.3.3',
    );
  });
});
