import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  endMediationCall,
  removeMediationParticipant,
} from '../app/incidents/[id]/mediation/actions';
import { api } from '../lib/api';
import { IDLE_STATE } from '../lib/mediation';
import { CONVERSATION_ID, createFakeCallClient } from '../test/fake-call-client';
import { INCIDENT_ID } from '../test/incident-detail';
import { renderWithIntl } from '../test/render';

import { MediationCall } from './MediationCall';

vi.mock('../app/incidents/[id]/mediation/actions', () => ({
  endMediationCall: vi.fn(),
  removeMediationParticipant: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  api: { createClientToken: vi.fn() },
}));

const OWN = 'agent-1';
const CUSTOMER = 'cust-9';
const DRIVER = 'PSTN-abc';

async function connectedCall(locale: 'en' | 'es' = 'en') {
  const fake = createFakeCallClient();
  const loadClient = vi.fn(async () => fake.client);
  const requestMic = vi.fn(async () => 'granted' as const);

  renderWithIntl(
    <MediationCall
      incidentId={INCIDENT_ID}
      customerName="Lucía Pérez"
      driverName="Marc Soler"
      loadClient={loadClient}
      requestMic={requestMic}
    />,
    { locale },
  );

  fireEvent.click(
    screen.getByRole('button', { name: locale === 'en' ? 'Join call' : 'Unirme a la llamada' }),
  );
  await waitFor(() => expect(fake.client.serverCall).toHaveBeenCalled());
  await fake.emit('legStatusUpdate', 'call-1', 'leg-1', 'ANSWERED');
  await waitFor(() => expect(fake.client.getMembers).toHaveBeenCalled());

  const memberEvent = (
    kind: 'member:invited' | 'member:joined' | 'member:left',
    userName: string,
  ) => fake.emit('memberEvent', { kind, conversationId: CONVERSATION_ID, userName });

  await memberEvent('member:joined', OWN);
  await memberEvent('member:joined', CUSTOMER);
  await memberEvent('member:joined', DRIVER);

  return { ...fake, memberEvent };
}

describe('call controls', () => {
  beforeEach(() => {
    vi.mocked(api.createClientToken)
      .mockReset()
      .mockResolvedValue({
        token: 'token-1',
        userName: OWN,
        expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      });
    vi.mocked(endMediationCall).mockReset().mockResolvedValue(IDLE_STATE);
    vi.mocked(removeMediationParticipant).mockReset().mockResolvedValue(IDLE_STATE);
  });

  it('only offers to end the call for everyone before joining', () => {
    renderWithIntl(
      <MediationCall incidentId={INCIDENT_ID} customerName="Lucía Pérez" driverName={null} />,
    );

    expect(screen.queryByRole('button', { name: 'Mute microphone' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Leave the call' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'End call for everyone' })).toBeInTheDocument();
  });

  describe('mute', () => {
    it('mutes and unmutes the agent, and shows it as pressed', async () => {
      const { client } = await connectedCall();
      const mute = screen.getByRole('button', { name: 'Mute microphone' });

      expect(mute).toHaveAttribute('aria-pressed', 'false');

      fireEvent.click(mute);
      await waitFor(() => expect(client.mute).toHaveBeenCalledWith('call-1'));
      await waitFor(() => expect(mute).toHaveAttribute('aria-pressed', 'true'));
      expect(screen.getByText('Your microphone is muted')).toBeInTheDocument();

      fireEvent.click(mute);
      await waitFor(() => expect(client.unmute).toHaveBeenCalledWith('call-1'));
      await waitFor(() => expect(mute).toHaveAttribute('aria-pressed', 'false'));
    });

    it('stays as it was when the SDK fails', async () => {
      const { client } = await connectedCall();

      client.mute.mockRejectedValue(new Error('no'));
      fireEvent.click(screen.getByRole('button', { name: 'Mute microphone' }));

      await waitFor(() => expect(client.mute).toHaveBeenCalled());
      expect(screen.getByRole('button', { name: 'Mute microphone' })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    });
  });

  describe('duration', () => {
    it('counts the time outside the status region', async () => {
      const start = Date.now();
      const now = vi.spyOn(Date, 'now').mockReturnValue(start);

      try {
        await connectedCall();

        expect(screen.getByText('00:00')).toBeInTheDocument();

        now.mockReturnValue(start + 75_000);

        const duration = await screen.findByText('01:15', {}, { timeout: 3_000 });

        expect(duration.closest('time')).toHaveAttribute('datetime', 'PT75S');
        expect(screen.getByRole('status')).not.toContainElement(duration);
        expect(duration.closest('[aria-live]')).toBeNull();
      } finally {
        now.mockRestore();
      }
    });
  });

  describe('leave', () => {
    it('hangs up this browser and leaves the others on the call', async () => {
      const { client } = await connectedCall();

      fireEvent.click(screen.getByRole('button', { name: 'Leave the call' }));

      await waitFor(() => expect(client.hangup).toHaveBeenCalledWith('call-1'));
      await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Call ended'));
      expect(endMediationCall).not.toHaveBeenCalled();
      expect(screen.queryByRole('button', { name: 'Leave the call' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Join again' })).toBeEnabled();
    });
  });

  describe('end call for everyone', () => {
    it('asks first and moves the focus to the dialog', async () => {
      await connectedCall();
      const trigger = screen.getByRole('button', { name: 'End call for everyone' });

      trigger.focus();
      fireEvent.click(trigger);

      const dialog = screen.getByRole('alertdialog', { name: 'End the call for everyone?' });

      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveAccessibleDescription(/disconnected/i);
      expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
      expect(endMediationCall).not.toHaveBeenCalled();
    });

    it('does nothing when it is cancelled, and gives the focus back', async () => {
      await connectedCall();
      const trigger = screen.getByRole('button', { name: 'End call for everyone' });

      trigger.focus();
      fireEvent.click(trigger);
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
      expect(endMediationCall).not.toHaveBeenCalled();
      expect(screen.getByRole('status')).toHaveTextContent('Connected');
    });

    it('is cancelled with Escape', async () => {
      await connectedCall();
      const trigger = screen.getByRole('button', { name: 'End call for everyone' });

      trigger.focus();
      fireEvent.click(trigger);
      fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    });

    it('keeps the focus inside while it is open', async () => {
      await connectedCall();

      fireEvent.click(screen.getByRole('button', { name: 'End call for everyone' }));
      const dialog = screen.getByRole('alertdialog');
      const confirm = within(dialog).getByRole('button', { name: 'End call for everyone' });

      confirm.focus();
      fireEvent.keyDown(dialog, { key: 'Tab' });
      expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();

      fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
      expect(confirm).toHaveFocus();
    });

    it('ends the call for everyone when it is confirmed', async () => {
      const { client } = await connectedCall();

      fireEvent.click(screen.getByRole('button', { name: 'End call for everyone' }));
      fireEvent.click(
        within(screen.getByRole('alertdialog')).getByRole('button', {
          name: 'End call for everyone',
        }),
      );

      await waitFor(() => expect(endMediationCall).toHaveBeenCalledWith(INCIDENT_ID));
      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
      await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Call ended'));
      expect(client.hangup).toHaveBeenCalledWith('call-1');
    });

    it('shows the error and keeps the call when Vonage fails', async () => {
      vi.mocked(endMediationCall).mockResolvedValue({ error: 'BAD_GATEWAY' });
      await connectedCall();

      fireEvent.click(screen.getByRole('button', { name: 'End call for everyone' }));
      fireEvent.click(
        within(screen.getByRole('alertdialog')).getByRole('button', {
          name: 'End call for everyone',
        }),
      );

      expect(await screen.findByRole('alert')).toHaveTextContent("Vonage couldn't place the call");
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent('Connected');
    });
  });

  describe('remove participant', () => {
    it.each([
      ['customer', 'Lucía Pérez'],
      ['driver', 'Marc Soler'],
    ] as const)('removes the %s only after confirming', async (role, name) => {
      await connectedCall();

      fireEvent.click(screen.getByRole('button', { name: `Remove ${name} from the call` }));

      const dialog = screen.getByRole('alertdialog', { name: `Remove ${name} from the call?` });

      expect(removeMediationParticipant).not.toHaveBeenCalled();

      fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));

      await waitFor(() =>
        expect(removeMediationParticipant).toHaveBeenCalledWith(INCIDENT_ID, role),
      );
      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
      expect(endMediationCall).not.toHaveBeenCalled();
      expect(screen.getByRole('status')).toHaveTextContent('Connected');
    });

    it('does nothing when it is cancelled', async () => {
      await connectedCall();
      const trigger = screen.getByRole('button', { name: 'Remove Marc Soler from the call' });

      trigger.focus();
      fireEvent.click(trigger);
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(removeMediationParticipant).not.toHaveBeenCalled();
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    });

    it('is only offered for the customer and the driver, never for the agent', async () => {
      await connectedCall();

      expect(screen.getAllByRole('button', { name: /^Remove .* from the call$/ })).toHaveLength(2);
      expect(screen.queryByRole('button', { name: /support agent/i })).not.toBeInTheDocument();
    });

    it('is not offered once the participant has left', async () => {
      const { memberEvent } = await connectedCall();

      await memberEvent('member:left', DRIVER);

      expect(
        screen.queryByRole('button', { name: 'Remove Marc Soler from the call' }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Remove Lucía Pérez from the call' }),
      ).toBeInTheDocument();
    });

    it('shows the error inside the dialog when it fails', async () => {
      vi.mocked(removeMediationParticipant).mockResolvedValue({ error: 'CONFLICT' });
      await connectedCall();

      fireEvent.click(screen.getByRole('button', { name: 'Remove Lucía Pérez from the call' }));
      fireEvent.click(
        within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Remove' }),
      );

      expect(await screen.findByRole('alert')).toHaveTextContent("This can't be done right now");
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    });
  });

  it('has the controls in Spanish', async () => {
    await connectedCall('es');

    expect(screen.getByRole('button', { name: 'Silenciar micrófono' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salir de la llamada' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Quitar a Marc Soler de la llamada' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Terminar la llamada para todos' }));

    expect(
      screen.getByRole('alertdialog', { name: '¿Terminar la llamada para todos?' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
  });
});
