export const COMMUNICATION_CHANNELS = ['sms', 'voice'] as const;

export type CommunicationChannel = (typeof COMMUNICATION_CHANNELS)[number];

export const COMMUNICATION_DIRECTIONS = ['inbound', 'outbound'] as const;

export type CommunicationDirection = (typeof COMMUNICATION_DIRECTIONS)[number];

export const COMMUNICATION_STATUSES = ['queued', 'in_progress', 'completed', 'failed'] as const;

export type CommunicationStatus = (typeof COMMUNICATION_STATUSES)[number];

export interface Communication {
  id: string;
  incidentId: string | null;
  channel: CommunicationChannel;
  direction: CommunicationDirection;
  fromNumber: string | null;
  toNumber: string | null;
  vonageUuid: string;
  status: CommunicationStatus;
  durationSeconds: number | null;
}
