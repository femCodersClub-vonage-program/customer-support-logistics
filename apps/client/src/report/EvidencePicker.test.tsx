import { fireEvent, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithIntl } from '../test/render.tsx';

import {
  EVIDENCE_ACCEPT,
  EVIDENCE_MAX_FILES,
  EVIDENCE_MAX_IMAGE_BYTES,
  EVIDENCE_PHOTO_CAPTURE_ACCEPT,
  EVIDENCE_VIDEO_CAPTURE_ACCEPT,
} from './evidence-files.ts';
import { EvidencePicker } from './EvidencePicker.tsx';

import type { Locale } from '@csl/shared-types';

function fileOf(name: string, type: string, size = 1024): File {
  const file = new File(['x'], name, { type });

  Object.defineProperty(file, 'size', { value: size });

  return file;
}

function Harness({
  suggestPhoto = false,
  disabled = false,
  initial = [],
}: Readonly<{ suggestPhoto?: boolean; disabled?: boolean; initial?: File[] }>) {
  const [files, setFiles] = useState<File[]>(initial);

  return (
    <EvidencePicker
      files={files}
      onChange={setFiles}
      suggestPhoto={suggestPhoto}
      disabled={disabled}
    />
  );
}

function renderPicker(props: Parameters<typeof Harness>[0] = {}, locale: Locale = 'en') {
  return renderWithIntl(<Harness {...props} />, { locale });
}

function photoCamera() {
  return screen.getByLabelText('Take a photo');
}

function videoCamera() {
  return screen.getByLabelText('Record a video');
}

function gallery() {
  return screen.getByLabelText('Choose from gallery');
}

function pick(input: HTMLElement, ...files: File[]) {
  fireEvent.change(input, { target: { files } });
}

describe('EvidencePicker', () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:preview');
    URL.revokeObjectURL = vi.fn();
  });

  it('opens the rear camera for photos and videos separately and the gallery with another button', () => {
    renderPicker();

    expect(photoCamera()).toHaveAttribute('capture', 'environment');
    expect(photoCamera()).toHaveAttribute('accept', EVIDENCE_PHOTO_CAPTURE_ACCEPT);
    expect(videoCamera()).toHaveAttribute('capture', 'environment');
    expect(videoCamera()).toHaveAttribute('accept', EVIDENCE_VIDEO_CAPTURE_ACCEPT);
    expect(gallery()).not.toHaveAttribute('capture');
    expect(gallery()).toHaveAttribute('accept', EVIDENCE_ACCEPT);
    expect(gallery()).toHaveAttribute('multiple');
  });

  it('tells the limits and links them to all three buttons', () => {
    renderPicker();

    const hint = 'Up to 5 files. Photos up to 10 MB, videos up to 50 MB.';

    expect(screen.getByText(hint)).toBeInTheDocument();
    expect(photoCamera()).toHaveAccessibleDescription(hint);
    expect(videoCamera()).toHaveAccessibleDescription(hint);
    expect(gallery()).toHaveAccessibleDescription(hint);
  });

  it('shows the name and a preview of a photo', () => {
    const { container } = renderPicker();

    pick(photoCamera(), fileOf('photo.jpg', 'image/jpeg'));

    expect(screen.getByText('photo.jpg')).toBeInTheDocument();
    expect(container.querySelector('img')).toHaveAttribute('src', 'blob:preview');
  });

  it('shows the name and a preview of a video', () => {
    renderPicker();

    pick(videoCamera(), fileOf('clip.mp4', 'video/mp4'));

    expect(screen.getByText('clip.mp4')).toBeInTheDocument();
    expect(screen.getByLabelText('clip.mp4', { selector: 'video' })).toHaveAttribute(
      'src',
      'blob:preview',
    );
  });

  it.each([
    ['photo.heic', 'image/heic'],
    ['photo.heif', 'image/heif'],
    ['photo.HEIC', ''],
  ])('shows a generic icon instead of a broken image for %s', (name, type) => {
    const { container } = renderPicker();

    pick(gallery(), fileOf(name, type));

    expect(screen.getByText(name)).toBeInTheDocument();
    expect(container.querySelector('img')).not.toBeInTheDocument();
  });

  it('falls back to the generic icon when the browser cannot show the image', () => {
    const { container } = renderPicker();

    pick(gallery(), fileOf('photo.jpg', 'image/jpeg'));
    fireEvent.error(container.querySelector('img') as HTMLImageElement);

    expect(container.querySelector('img')).not.toBeInTheDocument();
    expect(screen.getByText('photo.jpg')).toBeInTheDocument();
  });

  it('adds several files from the gallery in one go', () => {
    renderPicker();

    pick(gallery(), fileOf('a.jpg', 'image/jpeg'), fileOf('b.png', 'image/png'));

    expect(screen.getByText('a.jpg')).toBeInTheDocument();
    expect(screen.getByText('b.png')).toBeInTheDocument();
  });

  it('keeps the files already chosen when more are added', () => {
    renderPicker();

    pick(photoCamera(), fileOf('a.jpg', 'image/jpeg'));
    pick(gallery(), fileOf('b.jpg', 'image/jpeg'));

    expect(screen.getByText('a.jpg')).toBeInTheDocument();
    expect(screen.getByText('b.jpg')).toBeInTheDocument();
  });

  it('removes a file and frees its preview', () => {
    renderPicker();

    pick(photoCamera(), fileOf('a.jpg', 'image/jpeg'), fileOf('b.jpg', 'image/jpeg'));
    fireEvent.click(screen.getByRole('button', { name: 'Remove a.jpg' }));

    expect(screen.queryByText('a.jpg')).not.toBeInTheDocument();
    expect(screen.getByText('b.jpg')).toBeInTheDocument();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
  });

  it('shows no list when there are no files', () => {
    renderPicker();

    expect(screen.queryByRole('list', { name: 'Selected files' })).not.toBeInTheDocument();
  });

  describe('rejected files', () => {
    it('says a file of another type was not added and announces it', () => {
      renderPicker();

      pick(gallery(), fileOf('animation.gif', 'image/gif'));

      expect(screen.getByRole('alert')).toHaveTextContent(
        'animation.gif was not added. Only photos (JPEG, PNG, WebP, HEIC, HEIF) and videos (MP4, MOV) can be attached.',
      );
      expect(screen.queryByRole('button', { name: /Remove/ })).not.toBeInTheDocument();
    });

    it('says a file that is too big was not added', () => {
      renderPicker();

      pick(gallery(), fileOf('huge.jpg', 'image/jpeg', EVIDENCE_MAX_IMAGE_BYTES + 1));

      expect(screen.getByRole('alert')).toHaveTextContent(
        'huge.jpg was not added because it is too big. Photos can be up to 10 MB and videos up to 50 MB.',
      );
    });

    it('says when there are too many files, and keeps the ones that fit', () => {
      renderPicker();

      const photos = Array.from({ length: EVIDENCE_MAX_FILES + 1 }, (_, index) =>
        fileOf(`${String(index)}.jpg`, 'image/jpeg'),
      );

      pick(gallery(), ...photos);

      expect(screen.getByRole('alert')).toHaveTextContent(
        `${String(EVIDENCE_MAX_FILES)}.jpg was not added. You can attach up to 5 files.`,
      );
      expect(screen.getAllByRole('button', { name: /^Remove / })).toHaveLength(EVIDENCE_MAX_FILES);
    });

    it('lists every rejected file and still adds the valid ones', () => {
      renderPicker();

      pick(
        gallery(),
        fileOf('animation.gif', 'image/gif'),
        fileOf('photo.jpg', 'image/jpeg'),
        fileOf('clip.webm', 'video/webm'),
      );

      expect(screen.getAllByRole('listitem').length).toBeGreaterThanOrEqual(3);
      expect(screen.getByRole('alert')).toHaveTextContent('animation.gif was not added.');
      expect(screen.getByRole('alert')).toHaveTextContent('clip.webm was not added.');
      expect(screen.getByText('photo.jpg')).toBeInTheDocument();
    });

    it('keeps the list inside the alert and shows two files with the same name', () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      renderPicker();

      pick(gallery(), fileOf('image.gif', 'image/gif'), fileOf('image.gif', 'image/gif'));

      const alert = screen.getByRole('alert');

      expect(within(alert).getByRole('list')).toBeInTheDocument();
      expect(within(alert).getAllByRole('listitem')).toHaveLength(2);
      expect(error).not.toHaveBeenCalled();

      error.mockRestore();
    });

    it('announces again a file that is rejected twice in a row', () => {
      renderPicker();

      pick(gallery(), fileOf('animation.gif', 'image/gif'));

      const first = screen.getByRole('alert');

      pick(gallery(), fileOf('animation.gif', 'image/gif'));

      expect(screen.getByRole('alert')).not.toBe(first);
    });

    it('replaces the message with the next one and clears it when a file is removed', () => {
      renderPicker();

      pick(gallery(), fileOf('animation.gif', 'image/gif'));
      pick(gallery(), fileOf('photo.jpg', 'image/jpeg'));

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();

      pick(gallery(), fileOf('notes.pdf', 'application/pdf'));
      fireEvent.click(screen.getByRole('button', { name: 'Remove photo.jpg' }));

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('photo suggestion', () => {
    const suggestion = 'A photo of the problem helps us solve it faster.';

    it('suggests a photo when it is wanted and there is none yet', () => {
      renderPicker({ suggestPhoto: true });

      expect(screen.getByText(suggestion)).toBeInTheDocument();
    });

    it('does not suggest it when it is not wanted', () => {
      renderPicker({ suggestPhoto: false });

      expect(screen.queryByText(suggestion)).not.toBeInTheDocument();
    });

    it('stops suggesting it once there is a photo', () => {
      renderPicker({ suggestPhoto: true });

      pick(photoCamera(), fileOf('photo.jpg', 'image/jpeg'));

      expect(screen.queryByText(suggestion)).not.toBeInTheDocument();
    });

    it('counts a HEIC photo without a type as a photo', () => {
      renderPicker({ suggestPhoto: true });

      pick(photoCamera(), fileOf('photo.heic', ''));

      expect(screen.queryByText(suggestion)).not.toBeInTheDocument();
    });

    it('keeps suggesting a photo when there is only a video', () => {
      renderPicker({ suggestPhoto: true });

      pick(videoCamera(), fileOf('clip.mp4', 'video/mp4'));

      expect(screen.getByText(suggestion)).toBeInTheDocument();
    });
  });

  it('blocks everything while the report is being sent', () => {
    renderPicker({ disabled: true, initial: [fileOf('a.jpg', 'image/jpeg')] });

    expect(photoCamera()).toBeDisabled();
    expect(videoCamera()).toBeDisabled();
    expect(gallery()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove a.jpg' })).toBeDisabled();
  });

  it('renders in Spanish', () => {
    renderPicker({ initial: [fileOf('foto.jpg', 'image/jpeg')] }, 'es');

    expect(screen.getByLabelText('Hacer una foto')).toBeInTheDocument();
    expect(screen.getByLabelText('Grabar un vídeo')).toBeInTheDocument();
    expect(screen.getByLabelText('Elegir de la galería')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quitar foto.jpg' })).toBeInTheDocument();
  });
});
