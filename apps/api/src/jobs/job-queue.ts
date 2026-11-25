import type { DatabaseTransaction } from '../database/database.constants.js';

export const JOB_QUEUE = Symbol('JOB_QUEUE');

export const JOB_NAMES = ['outbound-sms', 'mediation-call'] as const;

export type JobName = (typeof JOB_NAMES)[number];

export interface JobPayloads {
  'outbound-sms': { communicationId: string; to: string; text: string };
  'mediation-call': { incidentId: string; attempt: number };
}

export interface SendJobOptions {
  delaySeconds?: number;
}

export type JobHandler<N extends JobName> = (data: JobPayloads[N]) => Promise<void>;

export interface JobQueue {
  send<N extends JobName>(
    tx: DatabaseTransaction,
    name: N,
    data: JobPayloads[N],
    options?: SendJobOptions,
  ): Promise<void>;
  work<N extends JobName>(name: N, handler: JobHandler<N>): void;
  drain(): Promise<void>;
}
