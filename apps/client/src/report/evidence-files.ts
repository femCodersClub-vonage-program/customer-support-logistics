export const EVIDENCE_MAX_FILES = 5;
export const EVIDENCE_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const EVIDENCE_MAX_VIDEO_BYTES = 50 * 1024 * 1024;

export const EVIDENCE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'video/mp4',
  'video/quicktime',
] as const;

export type EvidenceRejectionReason = 'type' | 'size' | 'tooMany';

export interface EvidenceRejection {
  name: string;
  reason: EvidenceRejectionReason;
}

export interface AddedFiles {
  files: File[];
  rejected: EvidenceRejection[];
}

function maxBytes(type: string): number {
  return type.startsWith('video/') ? EVIDENCE_MAX_VIDEO_BYTES : EVIDENCE_MAX_IMAGE_BYTES;
}

function rejectionOf(file: File, chosen: number): EvidenceRejectionReason | null {
  if (!EVIDENCE_MIME_TYPES.some((allowed) => allowed === file.type)) {
    return 'type';
  }

  if (file.size > maxBytes(file.type)) {
    return 'size';
  }

  return chosen >= EVIDENCE_MAX_FILES ? 'tooMany' : null;
}

export function addFiles(current: readonly File[], incoming: readonly File[]): AddedFiles {
  const files = [...current];
  const rejected: EvidenceRejection[] = [];

  for (const file of incoming) {
    const reason = rejectionOf(file, files.length);

    if (reason === null) {
      files.push(file);
    } else {
      rejected.push({ name: file.name, reason });
    }
  }

  return { files, rejected };
}
