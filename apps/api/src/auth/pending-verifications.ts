import { Injectable } from '@nestjs/common';

export const VERIFICATION_TTL_MS = 10 * 60 * 1000;

export interface PendingVerification {
  customerId: string | null;
  expiresAt: number;
  bySms: boolean;
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
    });
  }

  markBySms(requestId: string): void {
    const verification = this.pending.get(requestId);

    if (verification !== undefined) {
      verification.bySms = true;
    }
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
