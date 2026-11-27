import { ApiError } from '@csl/api-client';

import { api } from '../api.ts';

import { EVIDENCE_MIME_TYPES, mimeTypeOf } from './evidence-files.ts';

import type { ApiClient } from '@csl/api-client';
import type { EvidenceMimeType } from '@csl/contracts';

export type FileUploadPhase = 'queued' | 'uploading' | 'confirming' | 'done' | 'failed';

export interface FileUploadState {
  file: File;
  phase: FileUploadPhase;
  progress: number;
}

export interface UploadEvidenceResult {
  uploaded: number;
  failed: File[];
}

export type PutFileFn = (
  url: string,
  file: File,
  mimeType: string,
  onProgress: (percent: number) => void,
  signal: AbortSignal | undefined,
) => Promise<void>;

export interface UploadEvidenceOptions {
  apiClient?: Pick<ApiClient, 'requestEvidenceUpload' | 'completeEvidenceUpload'>;
  putFile?: PutFileFn;
  signal?: AbortSignal;
  onProgress?: (states: readonly FileUploadState[]) => void;
}

function createAbortError(): DOMException {
  return new DOMException('Evidence upload aborted', 'AbortError');
}

function isAbortError(error: unknown, signal: AbortSignal | undefined): boolean {
  return Boolean(signal?.aborted) || (error instanceof DOMException && error.name === 'AbortError');
}

function isEvidenceMimeType(value: string): value is EvidenceMimeType {
  return EVIDENCE_MIME_TYPES.some((allowed) => allowed === value);
}

export function putFileWithProgress(
  url: string,
  file: File,
  mimeType: string,
  onProgress: (percent: number) => void,
  signal: AbortSignal | undefined,
): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(createAbortError());
  }

  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    const cleanup = () => {
      signal?.removeEventListener('abort', handleAbort);
    };

    const handleAbort = () => {
      xhr.abort();
    };

    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', mimeType);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        const percent = Math.min(99, Math.max(0, Math.round((event.loaded / event.total) * 100)));

        onProgress(percent);
      }
    };

    xhr.onload = () => {
      cleanup();

      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(99);
        resolve();
      } else {
        reject(new Error(`Upload failed with status ${String(xhr.status)}`));
      }
    };

    xhr.onerror = () => {
      cleanup();
      reject(new Error('Network error during evidence upload'));
    };

    xhr.onabort = () => {
      cleanup();
      reject(createAbortError());
    };

    signal?.addEventListener('abort', handleAbort, { once: true });
    xhr.send(file);
  });
}

export async function uploadEvidenceFiles(
  incidentId: string,
  files: readonly File[],
  options: UploadEvidenceOptions = {},
): Promise<UploadEvidenceResult> {
  const { apiClient = api, putFile = putFileWithProgress, signal, onProgress } = options;

  const states: FileUploadState[] = files.map((file) => ({
    file,
    phase: 'queued',
    progress: 0,
  }));

  const emit = () => {
    onProgress?.(states.map((entry) => ({ ...entry })));
  };

  if (files.length === 0) {
    return { uploaded: 0, failed: [] };
  }

  emit();

  let uploaded = 0;
  const failed: File[] = [];

  for (let index = 0; index < files.length; index += 1) {
    if (signal?.aborted) {
      throw createAbortError();
    }

    const file = files[index];
    const entry = states[index];

    if (!file || !entry) {
      continue;
    }

    const mimeType = mimeTypeOf(file);

    if (!isEvidenceMimeType(mimeType)) {
      entry.phase = 'failed';
      entry.progress = 0;
      failed.push(file);
      emit();
      continue;
    }

    entry.phase = 'uploading';
    entry.progress = 0;
    emit();

    try {
      const { evidenceId, uploadUrl } = await apiClient.requestEvidenceUpload(
        incidentId,
        {
          fileName: file.name,
          mimeType,
          sizeBytes: file.size,
        },
        { signal },
      );

      await putFile(
        uploadUrl,
        file,
        mimeType,
        (percent) => {
          entry.progress = percent;
          emit();
        },
        signal,
      );

      entry.phase = 'confirming';
      entry.progress = 99;
      emit();

      await apiClient.completeEvidenceUpload(incidentId, evidenceId, { signal });

      entry.phase = 'done';
      entry.progress = 100;
      uploaded += 1;
      emit();
    } catch (error: unknown) {
      if (isAbortError(error, signal)) {
        throw createAbortError();
      }

      if (error instanceof ApiError && error.status === 401) {
        throw error;
      }

      entry.phase = 'failed';
      failed.push(file);
      emit();
    }
  }

  return { uploaded, failed };
}
