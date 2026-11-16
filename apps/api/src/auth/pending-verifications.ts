import { Injectable } from '@nestjs/common';

import { VERIFICATION_TTL_SECONDS } from '../vonage/vonage.service.js';

export const VERIFICATION_TTL_MS = VERIFICATION_TTL_SECONDS * 1000;

export interface PendingVerification {
  customerId: string | null;
  expiresAt: number;
  bySms: boolean;
  checks: number;
}

@Injectable()
export class PendingVerifications {
  private readonly pending = new Map<string, PendingVerification>();

  add(requestId: string, customerId: string | null, bySms = true): void {
    this.removeExpired();
    this.pending.set(requestId, {
      customerId,
      expiresAt: Date.now() + VERIFICATION_TTL_MS,
      bySms,
      checks: 0,
    });
  }

  markBySms(requestId: string): void {
    const verification = this.pending.get(requestId);

    if (verification !== undefined) {
      verification.bySms = true;
    }
  }

  countCheck(requestId: string): number {
    const verification = this.pending.get(requestId);

    if (verification === undefined) {
      return 0;
    }

    verification.checks += 1;

    return verification.checks;
  }

  find(requestId: string): PendingVerification | undefined {
    const verification = this.pending.get(requestId);

    if (verification === undefined || verification.expiresAt <= Date.now()) {
      return undefined;
    }

    return verification;
  }

  remove(requestId: string): void {
    this.pending.delete(requestId);
  }

  private removeExpired(): void {
    const now = Date.now();

    for (const [requestId, { expiresAt }] of this.pending) {
      if (expiresAt <= now) {
        this.pending.delete(requestId);
      }
    }
  }
}
