export const EVIDENCE_STATUSES = ['pending', 'ready'] as const;

export type EvidenceStatus = (typeof EVIDENCE_STATUSES)[number];

export interface Evidence {
  id: string;
  incidentId: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  status: EvidenceStatus;
}
