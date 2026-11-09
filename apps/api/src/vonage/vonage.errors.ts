import type { VonageService } from './vonage.service.js';

export type VonageOperation = keyof VonageService;

export class VonageDisabledError extends Error {
  override readonly name = 'VonageDisabledError';
  readonly operation: VonageOperation;

  constructor(operation: VonageOperation) {
    super(`Vonage is disabled, so "${operation}" was not sent`);
    this.operation = operation;
  }
}
