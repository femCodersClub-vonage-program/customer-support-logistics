import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../lib/api';
import { renderWithIntl } from '../test/render';

import { IncidentActions } from './IncidentActions';

vi.mock('../lib/api', () => ({
  api: {
    assignIncidentToMe: vi.fn(),
    notifyDriver: vi.fn(),
    notifyDriverAgain: vi.fn(),
    changeIncidentStatus: vi.fn(),
  },
}));

const mockPush = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: mockPush }),
}));

const defaultProps = {
  incidentId: 'incident-123',
  status: 'open' as const,
  agentId: null,
  currentAgentId: 'agent-123',
  hasDriver: true,
};

describe('IncidentActions', () => {
  beforeEach(() => {
    vi.mocked(api.assignIncidentToMe)
      .mockReset()
      .mockResolvedValue({} as never);
    vi.mocked(api.notifyDriver)
      .mockReset()
      .mockResolvedValue({} as never);
    vi.mocked(api.notifyDriverAgain)
      .mockReset()
      .mockResolvedValue({} as never);
    vi.mocked(api.changeIncidentStatus)
      .mockReset()
      .mockResolvedValue({} as never);
  });

  it('does not send an SMS before the agent confirms', () => {
    renderWithIntl(<IncidentActions {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: 'Notify driver' }));

    expect(screen.getByText('Send an SMS notification to the driver?')).toBeInTheDocument();
    expect(api.notifyDriver).not.toHaveBeenCalled();
  });

  it('sends the driver notification after confirmation', async () => {
    renderWithIntl(<IncidentActions {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: 'Notify driver' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => {
      expect(api.notifyDriver).toHaveBeenCalledWith('incident-123');
    });
  });

  it('assigns the incident to the current agent', async () => {
    renderWithIntl(<IncidentActions {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: 'Assign to me' }));

    await waitFor(() => {
      expect(api.assignIncidentToMe).toHaveBeenCalledWith('incident-123');
    });
  });

  it('sends a repeated notification with an idempotency key after confirmation', async () => {
    renderWithIntl(<IncidentActions {...defaultProps} status="notified" agentId="agent-123" />);

    fireEvent.click(screen.getByRole('button', { name: 'Notify driver again' }));

    expect(api.notifyDriverAgain).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => {
      expect(api.notifyDriverAgain).toHaveBeenCalledWith('incident-123', expect.any(String));
    });
  });
  it('starts mediation after confirmation', async () => {
    renderWithIntl(<IncidentActions {...defaultProps} status="notified" agentId="agent-123" />);

    fireEvent.click(screen.getByRole('button', { name: 'Start mediation' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => {
      expect(api.changeIncidentStatus).toHaveBeenCalledWith('incident-123', {
        status: 'in_mediation',
      });
    });

    expect(mockPush).not.toHaveBeenCalled();
  });
  it('requires a resolution note before resolving an incident', () => {
    renderWithIntl(<IncidentActions {...defaultProps} status="in_mediation" agentId="agent-123" />);

    fireEvent.click(screen.getByRole('button', { name: 'Resolve incident' }));

    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Resolution note'), {
      target: { value: 'Refund approved' },
    });

    expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled();
  });
});

describe('IncidentActions additional coverage', () => {
  it('requires an escalation reason and submits it', async () => {
    vi.mocked(api.changeIncidentStatus)
      .mockReset()
      .mockResolvedValue({} as never);

    renderWithIntl(<IncidentActions {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: 'Escalate incident' }));

    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Reason for escalation'), {
      target: { value: 'Repeated delivery failure' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => {
      expect(api.changeIncidentStatus).toHaveBeenCalledWith('incident-123', {
        status: 'escalated',
        reason: 'Repeated delivery failure',
      });
    });
  });

  it('shows an error when the notification API request fails', async () => {
    vi.mocked(api.notifyDriver).mockReset().mockRejectedValueOnce(new Error('Network unavailable'));

    renderWithIntl(<IncidentActions {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: 'Notify driver' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The action could not be completed');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows an error when a repeated notification returns HTTP 409', async () => {
    const { ApiError } = await import('@csl/api-client');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    vi.mocked(api.notifyDriverAgain)
      .mockReset()
      .mockRejectedValueOnce(new ApiError('Conflict', 409, {}));

    renderWithIntl(<IncidentActions {...defaultProps} status="notified" agentId="agent-123" />);

    fireEvent.click(screen.getByRole('button', { name: 'Notify driver again' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The action could not be completed');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(api.notifyDriverAgain).toHaveBeenCalledTimes(1);

    consoleError.mockRestore();
  });

  it('reuses the same idempotency key when a repeated notification is retried', async () => {
    const { ApiError } = await import('@csl/api-client');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    vi.mocked(api.notifyDriverAgain)
      .mockReset()
      .mockRejectedValueOnce(new ApiError('Conflict', 409, {}));

    renderWithIntl(<IncidentActions {...defaultProps} status="notified" agentId="agent-123" />);

    fireEvent.click(screen.getByRole('button', { name: 'Notify driver again' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The action could not be completed');

    const firstIdempotencyKey = vi.mocked(api.notifyDriverAgain).mock.calls[0]?.[1];
    expect(firstIdempotencyKey).toEqual(expect.any(String));

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => {
      expect(api.notifyDriverAgain).toHaveBeenCalledTimes(2);
    });

    expect(vi.mocked(api.notifyDriverAgain).mock.calls[1]?.[1]).toBe(firstIdempotencyKey);

    consoleError.mockRestore();
  });
});
