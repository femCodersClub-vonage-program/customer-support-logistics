import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { callDriverAgain, startMediation } from '../app/incidents/[id]/mediation/actions';
import { IDLE_STATE } from '../lib/mediation';
import { INCIDENT_ID, buildCommunication } from '../test/incident-detail';
import { renderWithIntl } from '../test/render';

import { DriverCallPanel } from './DriverCallPanel';

vi.mock('../app/incidents/[id]/mediation/actions', () => ({
  startMediation: vi.fn(),
  callDriverAgain: vi.fn(),
}));

describe('DriverCallPanel', () => {
  beforeEach(() => {
    vi.mocked(startMediation).mockReset().mockResolvedValue(IDLE_STATE);
    vi.mocked(callDriverAgain).mockReset().mockResolvedValue(IDLE_STATE);
  });

  it('starts the mediation when the incident is notified', async () => {
    renderWithIntl(
      <DriverCallPanel incidentId={INCIDENT_ID} status="notified" hasDriver call={undefined} />,
    );

    expect(screen.getByText('Not called yet')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Start mediation' }));

    await waitFor(() => expect(startMediation).toHaveBeenCalledWith(INCIDENT_ID));
    expect(callDriverAgain).not.toHaveBeenCalled();
  });

  it('calls the driver again once the last call has ended', async () => {
    renderWithIntl(
      <DriverCallPanel
        incidentId={INCIDENT_ID}
        status="in_mediation"
        hasDriver
        call={buildCommunication({ status: 'failed' })}
      />,
    );

    expect(screen.getByText('Failed')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Call driver again' }));

    await waitFor(() => expect(callDriverAgain).toHaveBeenCalledWith(INCIDENT_ID));
  });

  it('disables the call while the driver is on the line', () => {
    renderWithIntl(
      <DriverCallPanel
        incidentId={INCIDENT_ID}
        status="in_mediation"
        hasDriver
        call={buildCommunication({ status: 'in_progress' })}
      />,
    );

    expect(screen.getByRole('button', { name: 'Call driver again' })).toBeDisabled();
  });

  it('shows the error returned by the action', async () => {
    vi.mocked(startMediation).mockResolvedValue({ error: 'BAD_GATEWAY' });

    renderWithIntl(
      <DriverCallPanel incidentId={INCIDENT_ID} status="notified" hasDriver call={undefined} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Start mediation' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Vonage couldn't place the call. Try again in a moment.",
    );
  });

  it.each([
    ['open', true, 'The driver has to be notified before the mediation can start.'],
    ['notified', false, 'This incident has no driver to call.'],
  ] as const)('has no call button when %s and hasDriver is %s', (status, hasDriver, message) => {
    renderWithIntl(
      <DriverCallPanel
        incidentId={INCIDENT_ID}
        status={status}
        hasDriver={hasDriver}
        call={undefined}
      />,
    );

    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
