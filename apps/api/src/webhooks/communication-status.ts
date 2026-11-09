import type { CommunicationStatus } from '@csl/shared-types';

const PROGRESS: Record<CommunicationStatus, number> = {
  queued: 0,
  in_progress: 1,
  completed: 2,
  failed: 2,
};

const MESSAGE_STATUSES = new Map<string, CommunicationStatus>([
  ['submitted', 'in_progress'],
  ['delivered', 'completed'],
  ['rejected', 'failed'],
  ['undeliverable', 'failed'],
]);

const VOICE_STATUSES = new Map<string, CommunicationStatus>([
  ['started', 'queued'],
  ['ringing', 'queued'],
  ['answered', 'in_progress'],
  ['completed', 'completed'],
  ['busy', 'failed'],
  ['cancelled', 'failed'],
  ['unanswered', 'failed'],
  ['rejected', 'failed'],
  ['failed', 'failed'],
  ['timeout', 'failed'],
]);

export function fromMessageStatus(status: string): CommunicationStatus | null {
  return MESSAGE_STATUSES.get(status) ?? null;
}

export function fromVoiceStatus(status: string): CommunicationStatus | null {
  return VOICE_STATUSES.get(status) ?? null;
}

export function advancesStatus(current: CommunicationStatus, next: CommunicationStatus): boolean {
  return PROGRESS[next] > PROGRESS[current];
}
