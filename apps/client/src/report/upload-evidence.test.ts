import { ApiError } from '@csl/api-client';
import { describe, expect, it, vi } from 'vitest';

import { uploadEvidenceFiles } from './upload-evidence.ts';

import type { FileUploadState, PrepareFileFn, PutFileFn } from './upload-evidence.ts';

const INCIDENT_ID = '6f1e2d3c-4b5a-4987-8a6b-5c4d3e2f1a0b';
const EVIDENCE_1 = '11111111-1111-4111-8111-111111111111';
const EVIDENCE_2 = '22222222-2222-4222-8222-222222222222';

function makeFile(name: string, type: string): File {
  return new File(['file-bytes'], name, { type });
}

function buildJpegWithExif(): Uint8Array<ArrayBuffer> {
  const jfif = [0xff, 0xe0, 0x00, 0x09, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01];
  const exifPayload = Array.from(new TextEncoder().encode('Exif\0\0GPS:40.4168,-3.7038'));
  const exifLen = exifPayload.length + 2;
  const exif = [0xff, 0xe1, (exifLen >> 8) & 0xff, exifLen & 0xff, ...exifPayload];
  const sos = [0xff, 0xda, 0x00, 0x04, 0x11, 0x22, 0x33, 0x44, 0xff, 0xd9];

  return new Uint8Array([0xff, 0xd8, ...jfif, ...exif, ...sos]);
}

describe('uploadEvidenceFiles', () => {
  it('requests upload URL, PUTs the file with progress, and confirms each file in order', async () => {
    const snapshots: FileUploadState[][] = [];
    const requestEvidenceUpload = vi
      .fn()
      .mockResolvedValueOnce({
        evidenceId: EVIDENCE_1,
        uploadUrl: 'https://storage.example/put-1',
        expiresAt: '2026-11-27T14:00:00.000Z',
      })
      .mockResolvedValueOnce({
        evidenceId: EVIDENCE_2,
        uploadUrl: 'https://storage.example/put-2',
        expiresAt: '2026-11-27T14:00:00.000Z',
      });
    const completeEvidenceUpload = vi.fn().mockResolvedValue(undefined);
    const putFile: PutFileFn = vi.fn(async (_url, _file, _mimeType, onProgress) => {
      onProgress(40);
      onProgress(95);
    });

    const first = makeFile('box.jpg', 'image/jpeg');
    const second = makeFile('clip.mp4', 'video/mp4');

    const result = await uploadEvidenceFiles(INCIDENT_ID, [first, second], {
      apiClient: { requestEvidenceUpload, completeEvidenceUpload },
      putFile,
      onProgress: (states) => snapshots.push(states.map((s) => ({ ...s }))),
    });

    expect(result).toEqual({ uploaded: 2, failed: [] });
    expect(requestEvidenceUpload).toHaveBeenNthCalledWith(
      1,
      INCIDENT_ID,
      { fileName: 'box.jpg', mimeType: 'image/jpeg', sizeBytes: first.size },
      { signal: undefined },
    );
    expect(requestEvidenceUpload).toHaveBeenNthCalledWith(
      2,
      INCIDENT_ID,
      { fileName: 'clip.mp4', mimeType: 'video/mp4', sizeBytes: second.size },
      { signal: undefined },
    );
    expect(putFile).toHaveBeenCalledTimes(2);
    expect(completeEvidenceUpload).toHaveBeenNthCalledWith(1, INCIDENT_ID, EVIDENCE_1, {
      signal: undefined,
    });
    expect(completeEvidenceUpload).toHaveBeenNthCalledWith(2, INCIDENT_ID, EVIDENCE_2, {
      signal: undefined,
    });

    const finalSnapshot = snapshots[snapshots.length - 1];

    expect(finalSnapshot?.map((s) => ({ phase: s.phase, progress: s.progress }))).toEqual([
      { phase: 'done', progress: 100 },
      { phase: 'done', progress: 100 },
    ]);
  });

  it('continues uploading remaining files when one upload fails', async () => {
    const requestEvidenceUpload = vi
      .fn()
      .mockResolvedValueOnce({
        evidenceId: EVIDENCE_1,
        uploadUrl: 'https://storage.example/put-1',
        expiresAt: '2026-11-27T14:00:00.000Z',
      })
      .mockResolvedValueOnce({
        evidenceId: EVIDENCE_2,
        uploadUrl: 'https://storage.example/put-2',
        expiresAt: '2026-11-27T14:00:00.000Z',
      });
    const completeEvidenceUpload = vi.fn().mockResolvedValue(undefined);
    const putFile: PutFileFn = vi
      .fn()
      .mockRejectedValueOnce(new Error('Storage unavailable'))
      .mockResolvedValueOnce(undefined);

    const first = makeFile('broken.jpg', 'image/jpeg');
    const second = makeFile('ok.png', 'image/png');

    const result = await uploadEvidenceFiles(INCIDENT_ID, [first, second], {
      apiClient: { requestEvidenceUpload, completeEvidenceUpload },
      putFile,
    });

    expect(result).toEqual({ uploaded: 1, failed: [first] });
    expect(completeEvidenceUpload).toHaveBeenCalledOnce();
    expect(completeEvidenceUpload).toHaveBeenCalledWith(INCIDENT_ID, EVIDENCE_2, {
      signal: undefined,
    });
  });

  it('stops immediately and rethrows 401 ApiError when the session expires', async () => {
    const unauthorized = new ApiError('Unauthorized', 401, {
      error: { code: 'UNAUTHORIZED', message: 'Expired' },
    });
    const requestEvidenceUpload = vi.fn().mockRejectedValueOnce(unauthorized);
    const completeEvidenceUpload = vi.fn();
    const putFile: PutFileFn = vi.fn();

    await expect(
      uploadEvidenceFiles(
        INCIDENT_ID,
        [makeFile('a.jpg', 'image/jpeg'), makeFile('b.jpg', 'image/jpeg')],
        {
          apiClient: { requestEvidenceUpload, completeEvidenceUpload },
          putFile,
        },
      ),
    ).rejects.toBe(unauthorized);

    expect(requestEvidenceUpload).toHaveBeenCalledOnce();
    expect(putFile).not.toHaveBeenCalled();
  });

  it('aborts cleanly and skips remaining files when the AbortSignal is triggered', async () => {
    const controller = new AbortController();
    const requestEvidenceUpload = vi.fn().mockResolvedValue({
      evidenceId: EVIDENCE_1,
      uploadUrl: 'https://storage.example/put-1',
      expiresAt: '2026-11-27T14:00:00.000Z',
    });
    const completeEvidenceUpload = vi.fn();
    const putFile: PutFileFn = vi.fn(
      (_url, _file, _mimeType, _onProgress, signal) =>
        new Promise<void>((_resolve, reject) => {
          signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
          controller.abort();
        }),
    );

    await expect(
      uploadEvidenceFiles(
        INCIDENT_ID,
        [makeFile('a.jpg', 'image/jpeg'), makeFile('b.jpg', 'image/jpeg')],
        {
          apiClient: { requestEvidenceUpload, completeEvidenceUpload },
          putFile,
          signal: controller.signal,
        },
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });

    expect(requestEvidenceUpload).toHaveBeenCalledOnce();
    expect(completeEvidenceUpload).not.toHaveBeenCalled();
  });

  it('prepares images before requesting the upload URL and uploads the prepared file', async () => {
    const phases: string[] = [];
    const prepared = new File(['small-jpg'], 'receipt.jpg', { type: 'image/jpeg' });
    const prepareFile: PrepareFileFn = vi.fn().mockResolvedValue(prepared);
    const requestEvidenceUpload = vi.fn().mockResolvedValue({
      evidenceId: EVIDENCE_1,
      uploadUrl: 'https://storage.example/put-1',
      expiresAt: '2026-11-27T14:00:00.000Z',
    });
    const completeEvidenceUpload = vi.fn().mockResolvedValue(undefined);
    const putFile: PutFileFn = vi.fn().mockResolvedValue(undefined);

    const original = new File(['very-large-png-payload'], 'receipt.png', { type: 'image/png' });

    const result = await uploadEvidenceFiles(INCIDENT_ID, [original], {
      apiClient: { requestEvidenceUpload, completeEvidenceUpload },
      prepareFile,
      putFile,
      onProgress: (states) => {
        const phase = states[0]?.phase;

        if (phase && phases[phases.length - 1] !== phase) {
          phases.push(phase);
        }
      },
    });

    expect(result).toEqual({ uploaded: 1, failed: [] });
    expect(prepareFile).toHaveBeenCalledWith(original, undefined);
    expect(requestEvidenceUpload).toHaveBeenCalledWith(
      INCIDENT_ID,
      { fileName: 'receipt.jpg', mimeType: 'image/jpeg', sizeBytes: prepared.size },
      { signal: undefined },
    );
    expect(putFile).toHaveBeenCalledWith(
      'https://storage.example/put-1',
      prepared,
      'image/jpeg',
      expect.any(Function),
      undefined,
    );
    expect(phases).toEqual(['queued', 'preparing', 'uploading', 'confirming', 'done']);
  });

  it('strips JPEG EXIF/GPS metadata by default before uploading', async () => {
    let uploadedFile: File | undefined;
    const requestEvidenceUpload = vi.fn().mockResolvedValue({
      evidenceId: EVIDENCE_1,
      uploadUrl: 'https://storage.example/put-1',
      expiresAt: '2026-11-27T14:00:00.000Z',
    });
    const completeEvidenceUpload = vi.fn().mockResolvedValue(undefined);
    const putFile: PutFileFn = vi.fn(async (_url, file) => {
      uploadedFile = file;
    });

    const photoWithGps = new File([buildJpegWithExif()], 'street.jpg', { type: 'image/jpeg' });

    const result = await uploadEvidenceFiles(INCIDENT_ID, [photoWithGps], {
      apiClient: { requestEvidenceUpload, completeEvidenceUpload },
      putFile,
    });

    expect(result).toEqual({ uploaded: 1, failed: [] });
    expect(uploadedFile).toBeDefined();

    const uploadedText = new TextDecoder().decode(
      new Uint8Array(await (uploadedFile as File).arrayBuffer()),
    );

    expect(uploadedText).not.toContain('Exif');
    expect(uploadedText).not.toContain('40.4168');
    expect(uploadedText).toContain('JFIF');
  });

  it('marks a file as failed and continues remaining files if preparation throws', async () => {
    const prepareFile: PrepareFileFn = vi
      .fn()
      .mockRejectedValueOnce(new Error('Corrupt image'))
      .mockImplementationOnce(async (file) => file);
    const requestEvidenceUpload = vi.fn().mockResolvedValue({
      evidenceId: EVIDENCE_2,
      uploadUrl: 'https://storage.example/put-2',
      expiresAt: '2026-11-27T14:00:00.000Z',
    });
    const completeEvidenceUpload = vi.fn().mockResolvedValue(undefined);
    const putFile: PutFileFn = vi.fn().mockResolvedValue(undefined);

    const corrupt = makeFile('corrupt.png', 'image/png');
    const ok = makeFile('ok.jpg', 'image/jpeg');

    const result = await uploadEvidenceFiles(INCIDENT_ID, [corrupt, ok], {
      apiClient: { requestEvidenceUpload, completeEvidenceUpload },
      prepareFile,
      putFile,
    });

    expect(result).toEqual({ uploaded: 1, failed: [corrupt] });
    expect(requestEvidenceUpload).toHaveBeenCalledOnce();
  });
});
