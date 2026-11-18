import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadVonageClient } from '../call/call-client.ts';
import { queryMicrophonePermission, requestMicrophone } from '../call/microphone.ts';
import { CUSTOMER, apiError, apiUrl, renderApp, sessionOf } from '../test/app.tsx';
import { createFakeCallClient } from '../test/fake-call-client.ts';

vi.mock('../call/call-client.ts', () => ({ loadVonageClient: vi.fn() }));
vi.mock('../call/microphone.ts', () => ({
  queryMicrophonePermission: vi.fn(),
  requestMicrophone: vi.fn(),
}));

const INCIDENT_ID = '6f1e2d3c-4b5a-4987-8a6b-5c4d3e2f1a0b';

const server = setupServer();

const tokenAnswer = () =>
  http.post(apiUrl('/vonage/client-token'), () =>
    HttpResponse.json(
      {
        token: 'token-1',
        userName: `cust-${CUSTOMER.id}`,
        expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      },
      { status: 201 },
    ),
  );

let fake: ReturnType<typeof createFakeCallClient>;

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
beforeEach(() => {
  fake = createFakeCallClient();
  vi.mocked(loadVonageClient).mockResolvedValue(fake.client);
  vi.mocked(queryMicrophonePermission).mockResolvedValue('prompt');
  vi.mocked(requestMicrophone).mockResolvedValue('granted');
  server.use(sessionOf(CUSTOMER), tokenAnswer());
});
afterEach(() => {
  server.resetHandlers();
  vi.clearAllMocks();
});
afterAll(() => server.close());

const openCall = () => renderApp(`/call/${INCIDENT_ID}`);

const status = () => screen.getByRole('status');

const joinCall = async () => {
  openCall();
  fireEvent.click(await screen.findByRole('button', { name: 'Join the call' }));
  await waitFor(() => expect(status()).toHaveTextContent('Joining the call…'));
};

describe('/call/:id', () => {
  it('explains who is on the call and the microphone before asking for it', async () => {
    openCall();

    const heading = await screen.findByRole('heading', { level: 1, name: 'Mediation call' });
    const participants = within(screen.getByRole('region', { name: "Who's on the call" }));

    expect(heading).toHaveFocus();
    expect(participants.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'You',
      'A support agent',
      'The driver of your order, by phone',
    ]);
    expect(screen.getByRole('region', { name: 'Your microphone' })).toHaveTextContent(
      /your browser will ask to use your microphone/,
    );
    expect(requestMicrophone).not.toHaveBeenCalled();
    expect(loadVonageClient).not.toHaveBeenCalled();
  });

  it('joins the call and announces each status', async () => {
    await joinCall();

    expect(requestMicrophone).toHaveBeenCalledOnce();
    expect(fake.client.serverCall).toHaveBeenCalledWith({ incidentId: INCIDENT_ID });
    expect(status()).toHaveTextContent('Joining the call…');

    fake.emit('legStatusUpdate', 'call-1', 'leg-1', 'ANSWERED');

    expect(status()).toHaveTextContent('Connected');
    expect(screen.getByText('00:00')).toHaveAttribute('dateTime', 'PT0S');

    fake.emit('callMediaReconnecting', 'call-1');

    expect(status()).toHaveTextContent('Connection lost. Reconnecting…');
  });

  it('mutes the microphone with a toggle button', async () => {
    await joinCall();

    const mute = screen.getByRole('button', { name: 'Mute microphone' });

    expect(mute).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(mute);

    await waitFor(() => expect(mute).toHaveAttribute('aria-pressed', 'true'));
    expect(fake.client.mute).toHaveBeenCalledWith('call-1');
  });

  it('hangs up and offers the way back to the incident', async () => {
    await joinCall();

    fireEvent.click(screen.getByRole('button', { name: 'Hang up' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'The call has ended' }),
    ).toHaveFocus();
    expect(screen.getByText('You left the call.')).toBeInTheDocument();
    expect(fake.client.hangup).toHaveBeenCalledWith('call-1');
    expect(screen.getByRole('link', { name: 'Back to the incident' })).toHaveAttribute(
      'href',
      `/incidents/${INCIDENT_ID}`,
    );
  });

  it('says so when support ends the call', async () => {
    await joinCall();

    fake.emit('callHangup', 'call-1', null, 'REMOTE_HANGUP');

    expect(await screen.findByText('Support ended the call.')).toBeInTheDocument();
    expect(status()).toHaveTextContent('Call ended');
  });

  it('shows how to allow the microphone when the browser blocks it', async () => {
    vi.mocked(requestMicrophone).mockResolvedValue('denied');
    openCall();

    fireEvent.click(await screen.findByRole('button', { name: 'Join the call' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Allow the microphone' }),
    ).toHaveFocus();
    expect(screen.getByRole('region', { name: 'Chrome on Android' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Safari on iPhone' })).toBeInTheDocument();
    expect(loadVonageClient).not.toHaveBeenCalled();

    vi.mocked(requestMicrophone).mockResolvedValue('granted');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('button', { name: 'Hang up' })).toBeInTheDocument();
  });

  it('shows the microphone help straight away when it is already blocked', async () => {
    vi.mocked(queryMicrophonePermission).mockResolvedValue('denied');
    openCall();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Allow the microphone' }),
    ).toBeInTheDocument();
    expect(requestMicrophone).not.toHaveBeenCalled();
  });

  it('says the call is not available when the mediation is not open', async () => {
    server.use(http.post(apiUrl('/vonage/client-token'), () => apiError(409, 'CONFLICT')));
    openCall();

    fireEvent.click(await screen.findByRole('button', { name: 'Join the call' }));

    expect(await screen.findByText(/This call isn't available/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to the incident' })).toBeInTheDocument();
  });

  it('lets the customer try again when the connection drops', async () => {
    await joinCall();

    fake.emit('sessionError', 'TRANSPORT_CLOSED');

    expect(await screen.findByText(/There's no connection/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('button', { name: 'Hang up' })).toBeInTheDocument();
    expect(fake.client.serverCall).toHaveBeenCalledTimes(2);
  });
});
