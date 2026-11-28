import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_MAX_IMAGE_DIMENSION,
  fitDimensions,
  prepareEvidenceFile,
  prepareEvidenceFiles,
  replaceFileExtension,
  stripJpegMetadata,
} from './prepare-evidence.ts';

import type { DecodedImage, ImageTranscoder } from './prepare-evidence.ts';

function jpegSegment(markerSecondByte: number, payload: readonly number[]): number[] {
  const length = payload.length + 2;

  return [0xff, markerSecondByte, (length >> 8) & 0xff, length & 0xff, ...payload];
}

function buildJpegWithExifAndGps(): Uint8Array<ArrayBuffer> {
  const jfifApp0 = jpegSegment(0xe0, [0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01]);
  const exifPayload = Array.from(new TextEncoder().encode('Exif\0\0GPS:40.4168,-3.7038'));
  const exifApp1 = jpegSegment(0xe1, exifPayload);
  const comment = jpegSegment(0xfe, Array.from(new TextEncoder().encode('camera-note')));
  const dqt = jpegSegment(0xdb, [0x00, 0x01, 0x02]);
  const sosAndScan = [0xff, 0xda, 0x00, 0x04, 0x11, 0x22, 0x33, 0x44, 0xff, 0xd9];

  return new Uint8Array([0xff, 0xd8, ...jfifApp0, ...exifApp1, ...comment, ...dqt, ...sosAndScan]);
}

function blobOfSize(size: number, type: string): Blob {
  return new Blob([new Uint8Array(size)], { type });
}

describe('stripJpegMetadata', () => {
  it('removes EXIF/GPS (APP1) and comment (COM) segments while preserving JFIF and scan data', () => {
    const withExif = buildJpegWithExifAndGps();
    const stripped = stripJpegMetadata(withExif);
    const decodedText = new TextDecoder().decode(stripped);

    expect(stripped[0]).toBe(0xff);
    expect(stripped[1]).toBe(0xd8);
    expect(stripped[stripped.length - 2]).toBe(0xff);
    expect(stripped[stripped.length - 1]).toBe(0xd9);
    expect(decodedText).not.toContain('Exif');
    expect(decodedText).not.toContain('40.4168');
    expect(decodedText).not.toContain('camera-note');
    expect(decodedText).toContain('JFIF');
    expect(stripped.length).toBeLessThan(withExif.length);
  });

  it('returns non-JPEG bytes unchanged', () => {
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    expect(stripJpegMetadata(pngBytes)).toBe(pngBytes);
  });

  it('returns truncated or malformed JPEG data unchanged without throwing', () => {
    const malformed = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0xff, 0x01]);

    expect(stripJpegMetadata(malformed)).toBe(malformed);
  });
});

describe('fitDimensions', () => {
  it('does not upscale images smaller than the maximum dimension', () => {
    expect(fitDimensions(800, 600, DEFAULT_MAX_IMAGE_DIMENSION)).toEqual({
      width: 800,
      height: 600,
    });
  });

  it('scales landscape and portrait photos proportionally to the max dimension', () => {
    expect(fitDimensions(4000, 3000, 2000)).toEqual({ width: 2000, height: 1500 });
    expect(fitDimensions(3000, 4000, 2000)).toEqual({ width: 1500, height: 2000 });
  });
});

describe('replaceFileExtension', () => {
  it('updates extension when the MIME type changes and preserves matching extensions', () => {
    expect(replaceFileExtension('IMG_001.HEIC', 'image/jpeg')).toBe('IMG_001.jpg');
    expect(replaceFileExtension('screenshot.png', 'image/jpeg')).toBe('screenshot.jpg');
    expect(replaceFileExtension('photo.jpeg', 'image/jpeg')).toBe('photo.jpeg');
    expect(replaceFileExtension('photo', 'image/webp')).toBe('photo.webp');
  });
});

describe('prepareEvidenceFile', () => {
  it('leaves videos untouched without calling the transcoder', async () => {
    const decode = vi.fn();
    const video = new File(['video-bytes'], 'clip.mp4', { type: 'video/mp4' });

    const result = await prepareEvidenceFile(video, { transcoder: { decode } });

    expect(result).toBe(video);
    expect(decode).not.toHaveBeenCalled();
  });

  it('resizes large photos, lowers quality until within maxBytes, and closes the decoded image', async () => {
    const close = vi.fn();
    const encode = vi.fn(
      async (width: number, height: number, mimeType: string, quality?: number) => {
        expect(width).toBe(1920);
        expect(height).toBe(1440);

        if (quality !== undefined && quality > 0.7) {
          return blobOfSize(5000, mimeType);
        }

        return blobOfSize(900, mimeType);
      },
    );
    const transcoder: ImageTranscoder = {
      decode: vi.fn(async (): Promise<DecodedImage> => ({
        width: 4000,
        height: 3000,
        encode,
        close,
      })),
    };
    const photo = new File([buildJpegWithExifAndGps()], 'damaged-box.jpg', { type: 'image/jpeg' });

    const prepared = await prepareEvidenceFile(photo, {
      maxBytes: 1024,
      maxDimension: 1920,
      qualitySteps: [0.82, 0.65],
      transcoder,
    });

    expect(encode).toHaveBeenCalledTimes(2);
    expect(encode).toHaveBeenNthCalledWith(1, 1920, 1440, 'image/jpeg', 0.82);
    expect(encode).toHaveBeenNthCalledWith(2, 1920, 1440, 'image/jpeg', 0.65);
    expect(prepared.name).toBe('damaged-box.jpg');
    expect(prepared.type).toBe('image/jpeg');
    expect(prepared.size).toBe(900);
    expect(close).toHaveBeenCalledOnce();
  });

  it('converts oversized PNGs to JPEG when PNG exceeds maxBytes', async () => {
    const encode = vi.fn(async (_w: number, _h: number, mimeType: string) =>
      mimeType === 'image/png' ? blobOfSize(5000, 'image/png') : blobOfSize(800, 'image/jpeg'),
    );
    const transcoder: ImageTranscoder = {
      decode: vi.fn(async () => ({ width: 1200, height: 900, encode, close: vi.fn() })),
    };
    const png = new File(['png'], 'receipt.png', { type: 'image/png' });

    const prepared = await prepareEvidenceFile(png, {
      maxBytes: 1024,
      qualitySteps: [0.8],
      transcoder,
    });

    expect(prepared.type).toBe('image/jpeg');
    expect(prepared.name).toBe('receipt.jpg');
    expect(prepared.size).toBe(800);
  });

  it('re-encodes HEIC photos to JPEG when the browser can decode them', async () => {
    const transcoder: ImageTranscoder = {
      decode: vi.fn(async () => ({
        width: 1000,
        height: 1000,
        encode: vi.fn(async () => blobOfSize(700, 'image/jpeg')),
        close: vi.fn(),
      })),
    };
    const heic = new File(['heic-bytes'], 'IMG_42.HEIC', { type: '' });

    const prepared = await prepareEvidenceFile(heic, { transcoder });

    expect(prepared.type).toBe('image/jpeg');
    expect(prepared.name).toBe('IMG_42.jpg');
    expect(prepared.size).toBe(700);
  });

  it('falls back to original HEIC when the browser cannot decode HEIC', async () => {
    const transcoder: ImageTranscoder = {
      decode: vi.fn(async () => {
        throw new Error('Unsupported format');
      }),
    };
    const heic = new File(['heic-bytes'], 'IMG_42.heic', { type: 'image/heic' });

    const prepared = await prepareEvidenceFile(heic, { transcoder });

    expect(prepared).toBe(heic);
  });

  it('falls back to binary JPEG EXIF stripping when canvas decoding fails on a JPEG', async () => {
    const transcoder: ImageTranscoder = {
      decode: vi.fn(async () => {
        throw new Error('Canvas unavailable');
      }),
    };
    const jpegWithGps = new File([buildJpegWithExifAndGps()], 'street.jpg', { type: 'image/jpeg' });

    const prepared = await prepareEvidenceFile(jpegWithGps, { transcoder });
    const text = new TextDecoder().decode(new Uint8Array(await prepared.arrayBuffer()));

    expect(prepared.name).toBe('street.jpg');
    expect(prepared.type).toBe('image/jpeg');
    expect(text).not.toContain('Exif');
    expect(text).not.toContain('40.4168');
    expect(text).toContain('JFIF');
  });

  it('shrinks dimensions across passes when quality reduction alone is not enough', async () => {
    const seenWidths: number[] = [];
    const transcoder: ImageTranscoder = {
      decode: vi.fn(async () => ({
        width: 3000,
        height: 2000,
        encode: vi.fn(async (width: number, _height: number, mimeType: string) => {
          seenWidths.push(width);

          return blobOfSize(width > 1500 ? 4000 : 700, mimeType);
        }),
        close: vi.fn(),
      })),
    };
    const huge = new File(['huge'], 'huge.jpg', { type: 'image/jpeg' });

    const prepared = await prepareEvidenceFile(huge, {
      maxBytes: 1000,
      maxDimension: 1920,
      qualitySteps: [0.8],
      transcoder,
    });

    expect(seenWidths).toEqual([1920, 1440]);
    expect(prepared.size).toBe(700);
  });

  it('aborts cleanly when the AbortSignal is triggered', async () => {
    const controller = new AbortController();

    controller.abort();

    const photo = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });

    await expect(prepareEvidenceFile(photo, { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
  });
});

describe('prepareEvidenceFiles', () => {
  it('prepares images while preserving order and passing videos through', async () => {
    const transcoder: ImageTranscoder = {
      decode: vi.fn(async () => ({
        width: 800,
        height: 600,
        encode: vi.fn(async (_w: number, _h: number, mimeType: string) =>
          blobOfSize(400, mimeType),
        ),
        close: vi.fn(),
      })),
    };
    const photo = new File(['img'], 'a.jpg', { type: 'image/jpeg' });
    const video = new File(['vid'], 'b.mp4', { type: 'video/mp4' });

    const results = await prepareEvidenceFiles([photo, video], { transcoder });

    expect(results).toHaveLength(2);
    expect(results[0]?.size).toBe(400);
    expect(results[1]).toBe(video);
  });
});
