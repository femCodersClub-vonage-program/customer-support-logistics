import { ApiError } from '@csl/api-client';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../lib/api';
import { renderWithIntl } from '../test/render';

import { ApiStatus } from './ApiStatus';

vi.mock('../lib/api', () => ({
  api: { getHealth: vi.fn() },
}));

describe('ApiStatus', () => {
  beforeEach(() => {
    vi.mocked(api.getHealth).mockReset();
  });

  it('shows the API version when the API is healthy', async () => {
    vi.mocked(api.getHealth).mockResolvedValue({ status: 'ok', version: '1.2.3' });

    renderWithIntl(<ApiStatus />);

    expect(await screen.findByText('Online (version 1.2.3)')).toBeInTheDocument();
  });

  it('shows the HTTP status when the API responds with an error', async () => {
    vi.mocked(api.getHealth).mockRejectedValue(new ApiError('Request failed', 503, undefined));

    renderWithIntl(<ApiStatus />);

    expect(await screen.findByText('Unreachable: HTTP 503')).toBeInTheDocument();
  });
});
