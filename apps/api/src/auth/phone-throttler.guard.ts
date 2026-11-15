import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class PhoneThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(request: Record<string, unknown>): Promise<string> {
    const body = request.body;
    const phone =
      typeof body === 'object' && body !== null && 'phone' in body && typeof body.phone === 'string'
        ? body.phone.trim()
        : '';

    return phone === '' ? super.getTracker(request) : `phone:${phone}`;
  }

  protected override setResponseHeader(
    _response: Record<string, unknown>,
    _name: string,
    _value: string | number,
  ): void {}
}
