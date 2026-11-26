import { EVIDENCE_MAX_IMAGE_BYTES, mimeTypeOf } from './evidence-files.ts';

export const DEFAULT_MAX_IMAGE_DIMENSION = 1920;
export const DEFAULT_QUALITY_STEPS = [0.82, 0.72, 0.6, 0.48] as const;

const MIN_FALLBACK_DIMENSION = 640;
const RESIZE_FALLBACK_FACTOR = 0.75;
const MAX_RESIZE_PASSES = 3;

const JPEG_SOI_FIRST = 0xff;
const JPEG_SOI_SECOND = 0xd8;
const JPEG_MARKER_PREFIX = 0xff;
const JPEG_SOS = 0xda;
const JPEG_EOI = 0xd9;
const JPEG_APP1 = 0xe1;
const JPEG_APP15 = 0xef;
const JPEG_COM = 0xfe;

const EXTENSIONS_BY_MIME: Record<string, { preferred: string; accepted: readonly string[] }> = {
  'image/jpeg': { preferred: 'jpg', accepted: ['jpg', 'jpeg'] },
  'image/png': { preferred: 'png', accepted: ['png'] },
  'image/webp': { preferred: 'webp', accepted: ['webp'] },
};

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface DecodedImage {
  width: number;
  height: number;
  encode(width: number, height: number, mimeType: string, quality?: number): Promise<Blob | null>;
  close(): void;
}

export interface ImageTranscoder {
  decode(file: File): Promise<DecodedImage>;
}

export interface PrepareEvidenceOptions {
  maxBytes?: number;
  maxDimension?: number;
  qualitySteps?: readonly number[];
  signal?: AbortSignal;
  transcoder?: ImageTranscoder;
}

function createAbortError(): DOMException {
  return new DOMException('Evidence preparation aborted', 'AbortError');
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

function isStandaloneJpegMarker(marker: number): boolean {
  return (
    marker === 0x00 ||
    marker === 0x01 ||
    marker === JPEG_SOI_SECOND ||
    marker === JPEG_EOI ||
    (marker >= 0xd0 && marker <= 0xd7)
  );
}

function isStrippableJpegMetadataMarker(marker: number): boolean {
  return (marker >= JPEG_APP1 && marker <= JPEG_APP15) || marker === JPEG_COM;
}

/**
 * Removes APP1-APP15 (EXIF/GPS, XMP, IPTC, ICC) and COM comment segments from
 * a JPEG byte stream while preserving JFIF (APP0) and the image scan data.
 */
export function stripJpegMetadata(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 4 || bytes[0] !== JPEG_SOI_FIRST || bytes[1] !== JPEG_SOI_SECOND) {
    return bytes;
  }

  const kept: Uint8Array[] = [bytes.subarray(0, 2)];
  let offset = 2;

  while (offset < bytes.length) {
    if (bytes[offset] !== JPEG_MARKER_PREFIX) {
      return bytes;
    }

    const markerStart = offset;

    while (offset < bytes.length && bytes[offset] === JPEG_MARKER_PREFIX) {
      offset += 1;
    }

    if (offset >= bytes.length) {
      return bytes;
    }

    const marker = bytes[offset];

    if (marker === undefined) {
      return bytes;
    }

    offset += 1;

    if (marker === JPEG_SOS) {
      kept.push(bytes.subarray(markerStart));
      break;
    }

    if (isStandaloneJpegMarker(marker)) {
      kept.push(bytes.subarray(markerStart, offset));

      if (marker === JPEG_EOI) {
        break;
      }

      continue;
    }

    if (offset + 2 > bytes.length) {
      return bytes;
    }

    const high = bytes[offset];
    const low = bytes[offset + 1];

    if (high === undefined || low === undefined) {
      return bytes;
    }

    const segmentLength = (high << 8) | low;

    if (segmentLength < 2 || offset + segmentLength > bytes.length) {
      return bytes;
    }

    const segmentEnd = offset + segmentLength;

    if (!isStrippableJpegMetadataMarker(marker)) {
      kept.push(bytes.subarray(markerStart, segmentEnd));
    }

    offset = segmentEnd;
  }

  const totalLength = kept.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let cursor = 0;

  for (const chunk of kept) {
    result.set(chunk, cursor);
    cursor += chunk.length;
  }

  return result;
}

export function fitDimensions(
  width: number,
  height: number,
  maxDimension: number,
): ImageDimensions {
  const longest = Math.max(width, height);

  if (longest <= maxDimension || longest <= 0) {
    return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
  }

  const scale = maxDimension / longest;

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function replaceFileExtension(name: string, mimeType: string): string {
  const config = EXTENSIONS_BY_MIME[mimeType];

  if (!config) {
    return name;
  }

  const dot = name.lastIndexOf('.');

  if (dot <= 0) {
    return `${name}.${config.preferred}`;
  }

  const currentExt = name.slice(dot + 1).toLowerCase();

  if (config.accepted.includes(currentExt)) {
    return name;
  }

  return `${name.slice(0, dot)}.${config.preferred}`;
}

function encodeCanvas(
  source: CanvasImageSource,
  width: number,
  height: number,
  mimeType: string,
  quality?: number,
): Promise<Blob | null> {
  const canvas = document.createElement('canvas');

  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');

  if (!context) {
    canvas.width = 0;
    canvas.height = 0;

    return Promise.resolve(null);
  }

  context.drawImage(source, 0, 0, width, height);

  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(
      (blob) => {
        canvas.width = 0;
        canvas.height = 0;
        resolve(blob);
      },
      mimeType,
      quality,
    );
  });
}

function decodeWithImageElement(file: File): Promise<DecodedImage> {
  return new Promise<DecodedImage>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      resolve({
        width: image.naturalWidth,
        height: image.naturalHeight,
        encode: (width, height, mimeType, quality) =>
          encodeCanvas(image, width, height, mimeType, quality),
        close: () => {
          URL.revokeObjectURL(objectUrl);
        },
      });
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`Unable to decode image ${file.name}`));
    };

    image.src = objectUrl;
  });
}

const browserTranscoder: ImageTranscoder = {
  async decode(file: File): Promise<DecodedImage> {
    if (typeof createImageBitmap === 'function') {
      try {
        const bitmap = await createImageBitmap(file);

        return {
          width: bitmap.width,
          height: bitmap.height,
          encode: (width, height, mimeType, quality) =>
            encodeCanvas(bitmap, width, height, mimeType, quality),
          close: () => {
            bitmap.close();
          },
        };
      } catch {
        // Fall back to HTMLImageElement decoding when createImageBitmap rejects a format.
      }
    }

    return decodeWithImageElement(file);
  },
};

function targetMimeTypesFor(sourceMimeType: string): readonly string[] {
  if (sourceMimeType === 'image/png') {
    return ['image/png', 'image/jpeg'];
  }

  if (sourceMimeType === 'image/webp') {
    return ['image/webp', 'image/jpeg'];
  }

  return ['image/jpeg'];
}

function qualityStepsFor(
  mimeType: string,
  qualitySteps: readonly number[],
): readonly (number | undefined)[] {
  return mimeType === 'image/png' ? [undefined] : qualitySteps;
}

async function encodeWithinLimit(
  decoded: DecodedImage,
  sourceMimeType: string,
  maxBytes: number,
  maxDimension: number,
  qualitySteps: readonly number[],
  signal: AbortSignal | undefined,
): Promise<{ blob: Blob; mimeType: string } | null> {
  const mimeCandidates = targetMimeTypesFor(sourceMimeType);
  let best: { blob: Blob; mimeType: string } | null = null;
  let currentMaxDimension = maxDimension;

  for (let pass = 0; pass < MAX_RESIZE_PASSES; pass += 1) {
    const { width, height } = fitDimensions(decoded.width, decoded.height, currentMaxDimension);

    for (const targetMime of mimeCandidates) {
      for (const quality of qualityStepsFor(targetMime, qualitySteps)) {
        throwIfAborted(signal);

        const blob = await decoded.encode(width, height, targetMime, quality);

        if (!blob || blob.size === 0) {
          continue;
        }

        const effectiveMime = blob.type || targetMime;

        if (best === null || blob.size < best.blob.size) {
          best = { blob, mimeType: effectiveMime };
        }

        if (blob.size <= maxBytes) {
          return { blob, mimeType: effectiveMime };
        }
      }
    }

    const nextMaxDimension = Math.max(
      MIN_FALLBACK_DIMENSION,
      Math.round(currentMaxDimension * RESIZE_FALLBACK_FACTOR),
    );

    if (nextMaxDimension === currentMaxDimension) {
      break;
    }

    currentMaxDimension = nextMaxDimension;
  }

  return best;
}

async function fallbackStripJpeg(file: File, signal: AbortSignal | undefined): Promise<File> {
  const buffer = await file.arrayBuffer();

  throwIfAborted(signal);

  const original = new Uint8Array(buffer);
  const stripped = stripJpegMetadata(original);

  if (stripped === original) {
    return file;
  }

  const copy = new Uint8Array(stripped.byteLength);

  copy.set(stripped);

  return new File([copy.buffer], file.name, {
    type: 'image/jpeg',
    lastModified: file.lastModified,
  });
}

/**
 * Prepares a customer evidence file for upload:
 * - Videos are returned unchanged.
 * - Images are re-encoded on a canvas (which strips EXIF/GPS metadata and applies orientation)
 *   and resized/compressed to fit within `maxBytes` (`EVIDENCE_MAX_IMAGE_BYTES` by default).
 * - If canvas decoding fails on a JPEG, binary EXIF/GPS stripping is applied as a fallback.
 */
export async function prepareEvidenceFile(
  file: File,
  options: PrepareEvidenceOptions = {},
): Promise<File> {
  const {
    maxBytes = EVIDENCE_MAX_IMAGE_BYTES,
    maxDimension = DEFAULT_MAX_IMAGE_DIMENSION,
    qualitySteps = DEFAULT_QUALITY_STEPS,
    signal,
    transcoder = browserTranscoder,
  } = options;

  throwIfAborted(signal);

  const sourceMimeType = mimeTypeOf(file);

  if (!sourceMimeType.startsWith('image/')) {
    return file;
  }

  let decoded: DecodedImage;

  try {
    decoded = await transcoder.decode(file);
  } catch (error) {
    if (signal?.aborted) {
      throw createAbortError();
    }

    if (sourceMimeType === 'image/jpeg') {
      return fallbackStripJpeg(file, signal);
    }

    if (sourceMimeType === 'image/heic' || sourceMimeType === 'image/heif') {
      return file;
    }

    throw error;
  }

  try {
    throwIfAborted(signal);

    const encoded = await encodeWithinLimit(
      decoded,
      sourceMimeType,
      maxBytes,
      maxDimension,
      qualitySteps,
      signal,
    );

    if (!encoded) {
      return sourceMimeType === 'image/jpeg' ? fallbackStripJpeg(file, signal) : file;
    }

    const nextName = replaceFileExtension(file.name, encoded.mimeType);

    return new File([encoded.blob], nextName, {
      type: encoded.mimeType,
      lastModified: file.lastModified,
    });
  } finally {
    decoded.close();
  }
}

export async function prepareEvidenceFiles(
  files: readonly File[],
  options: PrepareEvidenceOptions = {},
): Promise<File[]> {
  const prepared: File[] = [];

  for (const file of files) {
    throwIfAborted(options.signal);
    prepared.push(await prepareEvidenceFile(file, options));
  }

  return prepared;
}
