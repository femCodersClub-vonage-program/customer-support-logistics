import {
  EVIDENCE_MAX_FILES,
  EVIDENCE_MAX_IMAGE_BYTES,
  EVIDENCE_MAX_VIDEO_BYTES,
  EVIDENCE_MIME_TYPES,
} from '@csl/contracts';

export { EVIDENCE_MAX_FILES } from '@csl/contracts';

export const EVIDENCE_ACCEPT = [...EVIDENCE_MIME_TYPES, '.heic', '.heif', '.mov'].join(',');

const TYPE_BY_EXTENSION = new Map([
  ['heic', 'image/heic'],
  ['heif', 'image/heif'],
  ['mov', 'video/quicktime'],
  ['mp4', 'video/mp4'],
]);

export type EvidenceRejectionReason = 'type' | 'size' | 'tooMany';

export interface EvidenceRejection {
  name: string;
  reason: EvidenceRejectionReason;
}

export interface AddedFiles {
  files: File[];
  rejected: EvidenceRejection[];
}

export function mimeTypeOf(file: File): string {
  if (file.type !== '') {
    return file.type;
  }

  const dot = file.name.lastIndexOf('.');
  const extension = dot === -1 ? '' : file.name.slice(dot + 1).toLowerCase();

  return TYPE_BY_EXTENSION.get(extension) ?? '';
}

function maxBytes(type: string): number {
  return type.startsWith('video/') ? EVIDENCE_MAX_VIDEO_BYTES : EVIDENCE_MAX_IMAGE_BYTES;
}

function rejectionOf(file: File, chosen: number): EvidenceRejectionReason | null {
  const type = mimeTypeOf(file);

  if (!EVIDENCE_MIME_TYPES.some((allowed) => allowed === type)) {
    return 'type';
  }

  if (file.size > maxBytes(type)) {
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
