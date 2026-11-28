import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../lib/api';
import { CONVERSATION_ID, createFakeCallClient } from '../test/fake-call-client';
import { INCIDENT_ID } from '../test/incident-detail';
import { renderWithIntl } from '../test/render';

import { MediationCall } from './MediationCall';

import type { MemberSnapshot } from '../lib/call/call-client';
import type { MicrophoneAccess } from '../lib/call/microphone';

vi.mock('../lib/api', () => ({
  api: { createClientToken: vi.fn() },
}));

const OWN = 'agent-1';
const CUSTOMER = 'cust-9';
const DRIVER = 'PSTN-abc';

function renderCall({
  microphone = 'granted',
  members = [],
  locale = 'en',
}: { microphone?: MicrophoneAccess; members?: MemberSnapshot[]; locale?: 'en' | 'es' } = {}) {
  const fake = createFakeCallClient(members);
  const loadClient = vi.fn(async () => fake.client);
  const requestMic = vi.fn(async () => microphone);

  const { unmount } = renderWithIntl(
    <MediationCall
      incidentId={INCIDENT_ID}
      customerName="Lucía Pérez"
      driverName="Marc Soler"
      loadClient={loadClient}
      requestMic={requestMic}
    />,
    { locale },
  );

  const join = async () => {
    fireEvent.click(screen.getByRole('button', { name: /join call|unirme a la llamada/i }));
    await waitFor(() => expect(requestMic).toHaveBeenCalled());
  };

  const memberEvent = (
    kind: 'member:invited' | 'member:joined' | 'member:left',
    userName: string,
  ) => fake.emit('memberEvent', { kind, conversationId: CONVERSATION_ID, userName });

  return { ...fake, loadClient, requestMic, join, memberEvent, unmount };
}

function participant(name: string) {
  return screen.getByText(name).closest('article') as HTMLElement;
}

describe('MediationCall', () => {
  beforeEach(() => {
    vi.mocked(api.createClientToken)
      .mockReset()
      .mockResolvedValue({
        token: 'token-1',
        userName: OWN,
        expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      });
  });

  describe('before joining', () => {
    it('explains the microphone before the browser asks for it', () => {
      const { requestMic, loadClient } = renderCall();

      expect(screen.getByText(/your browser will ask to use your microphone/i)).toBeInTheDocument();
      expect(requestMic).not.toHaveBeenCalled();
      expect(loadClient).not.toHaveBeenCalled();
      expect(api.createClientToken).not.toHaveBeenCalled();
    });

    it('is not connected yet, and the three participants wait', () => {
      renderCall();

      expect(screen.getByRole('status')).toHaveTextContent("You haven't joined the call");
      expect(within(participant('You (support agent)')).getByText('Invited')).toBeInTheDocument();
      expect(within(participant('Lucía Pérez')).getByText('Invited')).toBeInTheDocument();
      expect(within(participant('Marc Soler')).getByText('Invited')).toBeInTheDocument();
    });

    it('shows each participant with their channel and never a phone number', () => {
      renderCall();

      expect(participant('Lucía Pérez')).toHaveTextContent('Customer · Browser');
      expect(participant('Marc Soler')).toHaveTextContent('Driver · Phone');
      expect(document.body.textContent).not.toMatch(/\+?\d{9,}/);
    });

    it('has its texts in Spanish', () => {
      renderCall({ locale: 'es' });

      expect(screen.getByRole('button', { name: 'Unirme a la llamada' })).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent('No te has unido a la llamada');
      expect(participant('Marc Soler')).toHaveTextContent('Conductor · Teléfono');
    });
  });

  describe('joining', () => {
    it('joins inc-<id> with the agent token and the incident', async () => {
      const { client, join } = renderCall();

      await join();

      await waitFor(() =>
        expect(client.serverCall).toHaveBeenCalledWith({ incidentId: INCIDENT_ID }),
      );
      expect(api.createClientToken).toHaveBeenCalledWith(INCIDENT_ID);
      expect(client.createSession).toHaveBeenCalledWith('token-1');
      expect(screen.getByRole('status')).toHaveTextContent('Connecting…');
      expect(screen.getByRole('button', { name: 'Joining…' })).toBeDisabled();
    });

    it('shows each connection state in the status region', async () => {
      const { emit, join } = renderCall();

      await join();
      await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Connecting…'));

      await emit('legStatusUpdate', 'call-1', 'leg-1', 'ANSWERED');
      expect(screen.getByRole('status')).toHaveTextContent('Connected');
      expect(screen.getByRole('button', { name: 'In the call' })).toBeDisabled();

      await emit('reconnecting');
      expect(screen.getByRole('status')).toHaveTextContent('Connection lost. Reconnecting…');

      await emit('reconnection');
      expect(screen.getByRole('status')).toHaveTextContent('Connected');

      await emit('callHangup', 'call-1', undefined, 'REMOTE_HANGUP');
      expect(screen.getByRole('status')).toHaveTextContent('Call ended');
      expect(within(participant('You (support agent)')).getByText('Left')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Join again' })).toBeEnabled();
    });

    it('reconnects when the media drops and comes back', async () => {
      const { emit, join } = renderCall();

      await join();
      await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Connecting…'));
      await emit('legStatusUpdate', 'call-1', 'leg-1', 'ANSWERED');

      await emit('callMediaReconnecting', 'call-1');
      expect(screen.getByRole('status')).toHaveTextContent('Reconnecting');

      await emit('callMediaReconnection', 'call-1');
      expect(screen.getByRole('status')).toHaveTextContent('Connected');
    });

    it('lets the agent try again when the network is lost for good', async () => {
      const { emit, join, client } = renderCall();

      await join();
      await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Connecting…'));
      await emit('callMediaDisconnect', 'call-1', 'NETWORK');

      expect(screen.getByRole('alert')).toHaveTextContent('There is no connection');
      expect(client.deleteSession).toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Join again' })).toBeEnabled();
    });

    it('says when the call is not available', async () => {
      const { ApiError } = await import('@csl/api-client');

      vi.mocked(api.createClientToken).mockRejectedValue(new ApiError('Conflict', 409, undefined));
      const { join } = renderCall();

      await join();

      expect(await screen.findByRole('alert')).toHaveTextContent("The call isn't available");
    });
  });

  describe('microphone', () => {
    it('shows how to allow it when it is denied, and keeps the rest working', async () => {
      const { client, join } = renderCall({ microphone: 'denied' });

      await join();

      expect(
        await screen.findByRole('heading', { name: 'Allow the microphone' }),
      ).toBeInTheDocument();
      expect(screen.getByText(/Chrome or Edge:/)).toBeInTheDocument();
      expect(screen.getByText(/Safari:/)).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent("Couldn't connect");
      expect(client.createSession).not.toHaveBeenCalled();
      expect(api.createClientToken).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Join again' })).toBeEnabled();
      expect(participant('Lucía Pérez')).toBeInTheDocument();
    });

    it('asks again when the agent joins again', async () => {
      const { requestMic, join } = renderCall({ microphone: 'denied' });

      await join();
      await screen.findByRole('heading', { name: 'Allow the microphone' });
      fireEvent.click(screen.getByRole('button', { name: 'Join again' }));

      await waitFor(() => expect(requestMic).toHaveBeenCalledTimes(2));
    });

    it('says so when there is no microphone', async () => {
      const { join } = renderCall({ microphone: 'unavailable' });

      await join();

      expect(await screen.findByRole('alert')).toHaveTextContent('No microphone was found');
      expect(
        screen.queryByRole('heading', { name: 'Allow the microphone' }),
      ).not.toBeInTheDocument();
    });
  });

  describe('participants', () => {
    async function joined(options?: Parameters<typeof renderCall>[0]) {
      const call = renderCall(options);

      await call.join();
      await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Connecting…'));

      return call;
    }

    it('follows the conversation events without reloading', async () => {
      const { emit, memberEvent } = await joined();

      await emit('legStatusUpdate', 'call-1', 'leg-1', 'ANSWERED');
      await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Connected'));

      await memberEvent('member:joined', OWN);
      await memberEvent('member:invited', DRIVER);
      expect(within(participant('You (support agent)')).getByText('Connected')).toBeInTheDocument();
      expect(within(participant('Marc Soler')).getByText('Ringing')).toBeInTheDocument();

      await memberEvent('member:joined', CUSTOMER);
      await memberEvent('member:joined', DRIVER);
      expect(within(participant('Lucía Pérez')).getByText('Connected')).toBeInTheDocument();
      expect(within(participant('Marc Soler')).getByText('Connected')).toBeInTheDocument();

      await memberEvent('member:left', DRIVER);
      expect(within(participant('Marc Soler')).getByText('Left')).toBeInTheDocument();
    });

    it('announces who joins and who leaves in a polite live region', async () => {
      const { emit, memberEvent, client } = await joined();
      const live = document.querySelector('[aria-live="polite"]') as HTMLElement;

      await emit('legStatusUpdate', 'call-1', 'leg-1', 'ANSWERED');
      await waitFor(() => expect(client.getMembers).toHaveBeenCalled());

      await memberEvent('member:joined', CUSTOMER);
      expect(live).toHaveTextContent('Lucía Pérez joined the call.');

      await memberEvent('member:left', CUSTOMER);
      expect(live).toHaveTextContent('Lucía Pérez left the call.');
    });

    it('shows who was in the call before the agent joined', async () => {
      const { emit } = await joined({
        members: [
          { userName: CUSTOMER, state: 'JOINED' },
          { userName: DRIVER, state: 'JOINED' },
        ],
      });

      await emit('legStatusUpdate', 'call-1', 'leg-1', 'ANSWERED');

      await waitFor(() =>
        expect(within(participant('Lucía Pérez')).getByText('Connected')).toBeInTheDocument(),
      );
      expect(within(participant('Marc Soler')).getByText('Connected')).toBeInTheDocument();
    });

    it('ignores the events of other conversations', async () => {
      const { emit, client } = await joined();

      await emit('legStatusUpdate', 'call-1', 'leg-1', 'ANSWERED');
      await waitFor(() => expect(client.getConversationId).toHaveBeenCalledWith(INCIDENT_ID));
      await waitFor(() => expect(client.getMembers).toHaveBeenCalledWith(CONVERSATION_ID));

      await emit('memberEvent', {
        kind: 'member:joined',
        conversationId: 'CON-other',
        userName: CUSTOMER,
      });

      expect(within(participant('Lucía Pérez')).getByText('Invited')).toBeInTheDocument();
    });

    it('keeps the events that arrive before the conversation is known', async () => {
      const { emit, memberEvent } = await joined();

      await memberEvent('member:joined', CUSTOMER);
      await emit('legStatusUpdate', 'call-1', 'leg-1', 'ANSWERED');

      await waitFor(() =>
        expect(within(participant('Lucía Pérez')).getByText('Connected')).toBeInTheDocument(),
      );
    });

    it('keeps working from the events when the members cannot be read', async () => {
      const { emit, memberEvent, client } = await joined();

      client.getMembers.mockRejectedValue(new Error('forbidden'));
      await emit('legStatusUpdate', 'call-1', 'leg-1', 'ANSWERED');
      await waitFor(() => expect(client.getMembers).toHaveBeenCalled());

      await memberEvent('member:joined', CUSTOMER);

      expect(within(participant('Lucía Pérez')).getByText('Connected')).toBeInTheDocument();
    });
  });

  describe('session', () => {
    it('refreshes the session one minute before the token expires', async () => {
      vi.useFakeTimers();

      try {
        const tokenAt = (token: string, minutes: number) => ({
          token,
          userName: OWN,
          expiresAt: new Date(Date.now() + minutes * 60_000).toISOString(),
        });

        vi.mocked(api.createClientToken)
          .mockResolvedValueOnce(tokenAt('token-1', 15))
          .mockResolvedValueOnce(tokenAt('token-2', 30));
        const { client } = renderCall();

        fireEvent.click(screen.getByRole('button', { name: 'Join call' }));
        await act(() => vi.advanceTimersByTimeAsync(0));
        expect(client.serverCall).toHaveBeenCalled();
        expect(client.refreshSession).not.toHaveBeenCalled();

        await act(() => vi.advanceTimersByTimeAsync(14 * 60_000 - 1_000));
        expect(client.refreshSession).not.toHaveBeenCalled();

        await act(() => vi.advanceTimersByTimeAsync(1_000));
        expect(client.refreshSession).toHaveBeenCalledWith('token-2');
      } finally {
        vi.useRealTimers();
      }
    });

    it('hangs up and closes the session when the agent leaves the page', async () => {
      const { client, join, unmount, listenerCount } = renderCall();

      await join();
      await waitFor(() => expect(client.serverCall).toHaveBeenCalled());
      await waitFor(() => expect(listenerCount()).toBeGreaterThan(0));

      unmount();

      expect(client.hangup).toHaveBeenCalledWith('call-1');
      expect(client.deleteSession).toHaveBeenCalled();
      expect(listenerCount()).toBe(0);
    });
  });
});
