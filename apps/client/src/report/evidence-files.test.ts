import { describe, expect, it } from 'vitest';

import {
  addFiles,
  EVIDENCE_ACCEPT,
  EVIDENCE_MAX_FILES,
  EVIDENCE_MAX_IMAGE_BYTES,
  EVIDENCE_MAX_VIDEO_BYTES,
  EVIDENCE_MIME_TYPES,
  mimeTypeOf,
} from './evidence-files.ts';

function fileOf(name: string, type: string, size = 1024): File {
  const file = new File(['x'], name, { type });

  Object.defineProperty(file, 'size', { value: size });

  return file;
}

describe('addFiles', () => {
  it.each([
    ['photo.jpg', 'image/jpeg'],
    ['photo.png', 'image/png'],
    ['photo.webp', 'image/webp'],
    ['photo.heic', 'image/heic'],
    ['photo.heif', 'image/heif'],
    ['video.mp4', 'video/mp4'],
    ['video.mov', 'video/quicktime'],
  ])('accepts %s', (name, type) => {
    const file = fileOf(name, type);

    expect(addFiles([], [file])).toEqual({ files: [file], rejected: [] });
  });

  it('keeps the files already chosen and adds the new ones after them', () => {
    const first = fileOf('a.jpg', 'image/jpeg');
    const second = fileOf('b.jpg', 'image/jpeg');

    expect(addFiles([first], [second]).files).toEqual([first, second]);
  });

  it('does not change the list it receives', () => {
    const current = [fileOf('a.jpg', 'image/jpeg')];

    addFiles(current, [fileOf('b.jpg', 'image/jpeg')]);

    expect(current).toHaveLength(1);
  });

  it.each([
    ['animation.gif', 'image/gif'],
    ['clip.webm', 'video/webm'],
    ['notes.pdf', 'application/pdf'],
    ['unknown', ''],
  ])('rejects %s because of its type', (name, type) => {
    expect(addFiles([], [fileOf(name, type)])).toEqual({
      files: [],
      rejected: [{ name, reason: 'type' }],
    });
  });

  it('accepts a photo of exactly the size limit and rejects one byte more', () => {
    const exact = fileOf('exact.jpg', 'image/jpeg', EVIDENCE_MAX_IMAGE_BYTES);
    const over = fileOf('over.jpg', 'image/jpeg', EVIDENCE_MAX_IMAGE_BYTES + 1);

    expect(addFiles([], [exact]).rejected).toEqual([]);
    expect(addFiles([], [over]).rejected).toEqual([{ name: 'over.jpg', reason: 'size' }]);
  });

  it('allows a video bigger than a photo, up to its own limit', () => {
    const video = fileOf('clip.mp4', 'video/mp4', EVIDENCE_MAX_IMAGE_BYTES + 1);
    const tooBig = fileOf('long.mp4', 'video/mp4', EVIDENCE_MAX_VIDEO_BYTES + 1);

    expect(addFiles([], [video]).rejected).toEqual([]);
    expect(addFiles([], [tooBig]).rejected).toEqual([{ name: 'long.mp4', reason: 'size' }]);
  });

  it('accepts files up to the maximum and rejects the rest in order', () => {
    const incoming = Array.from({ length: EVIDENCE_MAX_FILES + 2 }, (_, index) =>
      fileOf(`${String(index)}.jpg`, 'image/jpeg'),
    );
    const { files, rejected } = addFiles([], incoming);

    expect(files).toHaveLength(EVIDENCE_MAX_FILES);
    expect(rejected).toEqual([
      { name: `${String(EVIDENCE_MAX_FILES)}.jpg`, reason: 'tooMany' },
      { name: `${String(EVIDENCE_MAX_FILES + 1)}.jpg`, reason: 'tooMany' },
    ]);
  });

  it('counts the files already chosen towards the maximum', () => {
    const current = Array.from({ length: EVIDENCE_MAX_FILES }, (_, index) =>
      fileOf(`${String(index)}.jpg`, 'image/jpeg'),
    );

    expect(addFiles(current, [fileOf('extra.jpg', 'image/jpeg')]).rejected).toEqual([
      { name: 'extra.jpg', reason: 'tooMany' },
    ]);
  });

  it('keeps accepting valid files after a rejected one in the same batch', () => {
    const bad = fileOf('animation.gif', 'image/gif');
    const good = fileOf('photo.jpg', 'image/jpeg');
    const { files, rejected } = addFiles([], [bad, good]);

    expect(files).toEqual([good]);
    expect(rejected).toEqual([{ name: 'animation.gif', reason: 'type' }]);
  });
});

describe('files without a type', () => {
  it.each(['photo.heic', 'PHOTO.HEIC', 'photo.heif', 'clip.mov', 'clip.mp4'])(
    'accepts %s by its extension',
    (name) => {
      const file = fileOf(name, '');

      expect(addFiles([], [file])).toEqual({ files: [file], rejected: [] });
    },
  );

  it.each(['notes.pdf', 'animation.gif', 'heic', 'photo.heic.txt'])(
    'rejects %s when the extension is not one of the accepted ones',
    (name) => {
      expect(addFiles([], [fileOf(name, '')]).rejected).toEqual([{ name, reason: 'type' }]);
    },
  );

  it('applies the video limit to a MOV video and the photo limit to a HEIC photo', () => {
    const video = fileOf('clip.mov', '', EVIDENCE_MAX_IMAGE_BYTES + 1);
    const photo = fileOf('photo.heic', '', EVIDENCE_MAX_IMAGE_BYTES + 1);

    expect(addFiles([], [video]).rejected).toEqual([]);
    expect(addFiles([], [photo]).rejected).toEqual([{ name: 'photo.heic', reason: 'size' }]);
  });
});

describe('mimeTypeOf', () => {
  it('keeps the type the browser gives', () => {
    expect(mimeTypeOf(fileOf('photo.heic', 'image/jpeg'))).toBe('image/jpeg');
  });

  it('guesses the type from the extension when the browser gives none', () => {
    expect(mimeTypeOf(fileOf('photo.HEIC', ''))).toBe('image/heic');
    expect(mimeTypeOf(fileOf('clip.mov', ''))).toBe('video/quicktime');
  });

  it('gives an empty type when it cannot guess it', () => {
    expect(mimeTypeOf(fileOf('notes', ''))).toBe('');
  });
});

describe('EVIDENCE_ACCEPT', () => {
  it('lists the accepted types and the extensions some browsers need', () => {
    expect(EVIDENCE_ACCEPT.split(',')).toEqual([...EVIDENCE_MIME_TYPES, '.heic', '.heif', '.mov']);
  });
});
