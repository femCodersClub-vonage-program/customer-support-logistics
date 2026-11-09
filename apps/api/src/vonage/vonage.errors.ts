import type { VonageService } from './vonage.service.js';

export type VonageOperation = keyof VonageService;

export abstract class VonageError extends Error {
  readonly operation: VonageOperation;

  protected constructor(operation: VonageOperation, message: string) {
    super(message);
    this.operation = operation;
  }
}

export class VonageDisabledError extends VonageError {
  override readonly name = 'VonageDisabledError';

  constructor(operation: VonageOperation) {
    super(operation, `Vonage is disabled, so "${operation}" was not sent`);
  }
}

export class VonageTimeoutError extends VonageError {
  override readonly name = 'VonageTimeoutError';
  readonly timeoutMs: number;

  constructor(operation: VonageOperation, timeoutMs: number) {
    super(operation, `Vonage did not answer "${operation}" within ${timeoutMs} ms`);
    this.timeoutMs = timeoutMs;
  }
}

export class VonageRequestError extends VonageError {
  override readonly name = 'VonageRequestError';
  readonly status: number | undefined;
  readonly reason: string | undefined;

  constructor(
    operation: VonageOperation,
    { status, reason }: { status?: number; reason?: string } = {},
  ) {
    const details = [status && `status ${status}`, reason].filter(Boolean).join(', ');
    super(operation, `Vonage rejected "${operation}"${details ? ` (${details})` : ''}`);
    this.status = status;
    this.reason = reason;
  }
}

export interface VonageErrorDetails {
  status?: number;
  reason?: string;
  type?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasResponse(error: unknown): error is { response: Response } {
  return (
    isRecord(error) &&
    isRecord(error.response) &&
    typeof error.response.status === 'number' &&
    typeof error.response.json === 'function'
  );
}

function hasFailedSmsMessages(
  error: unknown,
): error is { getFailedMessages(): { status?: unknown; errorText?: unknown }[] } {
  return isRecord(error) && typeof error.getFailedMessages === 'function';
}

export function isAbortError(error: unknown): boolean {
  return isRecord(error) && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

async function readProblem(response: Response): Promise<{ title?: string; type?: string }> {
  try {
    const body: unknown = await response.json();

    if (!isRecord(body)) {
      return {};
    }

    return {
      title: typeof body.title === 'string' ? body.title : undefined,
      type: typeof body.type === 'string' ? body.type : undefined,
    };
  } catch {
    return {};
  }
}

export async function readVonageErrorDetails(error: unknown): Promise<VonageErrorDetails> {
  if (hasResponse(error)) {
    const { title, type } = await readProblem(error.response);
    return { status: error.response.status, reason: title, type };
  }

  if (hasFailedSmsMessages(error)) {
    const [failed] = error.getFailedMessages();
    return {
      reason: typeof failed?.errorText === 'string' ? failed.errorText : undefined,
      type: typeof failed?.status === 'string' ? `sms-status-${failed.status}` : undefined,
    };
  }

  return {};
}
