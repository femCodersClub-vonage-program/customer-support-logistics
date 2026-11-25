import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithIntl } from '../test/render';

import { EvidenceGallery } from './EvidenceGallery';

const image = {
  id: '00000000-0000-4000-8000-000000000001',
  mimeType: 'image/jpeg',
  sizeBytes: 100,
  createdAt: '2026-11-16T12:00:00.000Z',
  downloadUrl: 'https://storage.test/image',
};

describe('EvidenceGallery', () => {
  it('shows an empty state when there is no evidence', () => {
    renderWithIntl(<EvidenceGallery evidence={[]} />);
    expect(screen.getByText('No evidence uploaded.')).toBeInTheDocument();
  });

  it('renders an image thumbnail and video player with signed URLs', () => {
    const { container } = renderWithIntl(
      <EvidenceGallery
        evidence={[
          image,
          {
            ...image,
            id: '00000000-0000-4000-8000-000000000002',
            mimeType: 'video/mp4',
            downloadUrl: 'https://storage.test/video',
          },
        ]}
      />,
    );
    expect(screen.getByRole('img')).toHaveAttribute('src', image.downloadUrl);
    expect(container.querySelector('video')).toHaveAttribute('src', 'https://storage.test/video');
  });
});
