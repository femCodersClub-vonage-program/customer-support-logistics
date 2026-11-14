import { Reflector } from '@nestjs/core';
import { ThrottlerStorageService } from '@nestjs/throttler';
import { describe, expect, it } from 'vitest';

import { PhoneThrottlerGuard } from './phone-throttler.guard.js';

import type { ThrottlerModuleOptions } from '@nestjs/throttler';

class ExposedPhoneThrottlerGuard extends PhoneThrottlerGuard {
  trackerOf(request: Record<string, unknown>): Promise<string> {
    return this.getTracker(request);
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

  it('counts requests without a phone together', async () => {
    await expect(guard.trackerOf({ body: {} })).resolves.toBe('phone:');
    await expect(guard.trackerOf({ body: { phone: 34600000001 } })).resolves.toBe('phone:');
  });
});
