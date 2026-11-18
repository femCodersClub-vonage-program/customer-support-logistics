import { act, renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { apiError, apiUrl } from '../test/app.tsx';
import { createFakeCallClient } from '../test/fake-call-client.ts';

import { TOKEN_REFRESH_MARGIN_MS, useVonageCall } from './useVonageCall.ts';

import type { MicrophoneAccess } from './microphone.ts';

const INCIDENT_ID = '6f1e2d3c-4b5a-4987-8a6b-5c4d3e2f1a0b';

const server = setupServer();

let tokenBodies: unknown[] = [];

const tokenAnswers = (...tokens: { token: string; expiresInMs: number }[]) => {
  let next = 0;

  return http.post(apiUrl('/vonage/client-token'), async ({ request }) => {
    tokenBodies.push(await request.json());
    const { token, expiresInMs } = tokens[Math.min(next++, tokens.length - 1)]!;

    return HttpResponse.json(
      { token, userName: 'cust-1', expiresAt: new Date(Date.now() + expiresInMs).toISOString() },
      { status: 201 },
    );
  });
};

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
beforeEach(() => {
  tokenBodies = [];
  server.use(tokenAnswers({ token: 'token-1', expiresInMs: 15 * 60_000 }));
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderCall(microphone: MicrophoneAccess = 'granted') {
  const fake = createFakeCallClient();
  const loadClient = vi.fn(async () => fake.client);
  const requestMic = vi.fn(async () => microphone);
  const hook = renderHook(() => useVonageCall(INCIDENT_ID, { loadClient, requestMic }));

  const join = () => act(() => hook.result.current.join());

  return { ...fake, ...hook, loadClient, requestMic, join };
}

describe('useVonageCall', () => {
  it('starts idle', () => {
    const { result } = renderCall();

    expect(result.current.state.status).toBe('idle');
  });

  it('opens a session with a token for the incident and calls the server', async () => {
    const { client, result, join } = renderCall();

    await join();

    expect(tokenBodies).toEqual([{ incidentId: INCIDENT_ID }]);
    expect(client.createSession).toHaveBeenCalledWith('token-1');
    expect(client.serverCall).toHaveBeenCalledWith({ incidentId: INCIDENT_ID });
    expect(result.current.state).toMatchObject({ status: 'ringing', callId: 'call-1' });
  });

  it('is connected once the leg is answered', async () => {
    const { emit, result, join } = renderCall();

    await join();
    emit('legStatusUpdate', 'call-1', 'leg-1', 'ANSWERED');

    expect(result.current.state).toMatchObject({
      status: 'connected',
      connectedAt: expect.any(Number),
    });
  });

  it('ignores the events of another call', async () => {
    const { emit, result, join } = renderCall();

    await join();
    emit('legStatusUpdate', 'call-2', 'leg-2', 'ANSWERED');
    emit('callHangup', 'call-2', null, 'REMOTE_HANGUP');

    expect(result.current.state.status).toBe('ringing');
  });

  it.each([
    ['denied', 'microphone_denied'],
    ['unavailable', 'microphone_unavailable'],
  ] as const)('fails without a token when the microphone is %s', async (microphone, failure) => {
    const { loadClient, result, join } = renderCall(microphone);

    await join();

    expect(result.current.state).toMatchObject({ status: 'failed', failure });
    expect(tokenBodies).toEqual([]);
    expect(loadClient).not.toHaveBeenCalled();
  });

  it.each([
    [404, 'NOT_FOUND'],
    [409, 'CONFLICT'],
  ])('is not available when the API answers %s', async (status, code) => {
    server.use(http.post(apiUrl('/vonage/client-token'), () => apiError(status, code)));
    const { client, result, join } = renderCall();

    await join();

    expect(result.current.state).toMatchObject({ status: 'failed', failure: 'not_available' });
    expect(client.createSession).not.toHaveBeenCalled();
  });

  it('fails without connection when the token request does not reach the API', async () => {
    server.use(http.post(apiUrl('/vonage/client-token'), () => HttpResponse.error()));
    const { result, join } = renderCall();

    await join();

    expect(result.current.state).toMatchObject({ status: 'failed', failure: 'no_connection' });
  });

  it('closes the session when the call cannot be placed', async () => {
    const { client, listenerCount, result, join } = renderCall();
    client.serverCall.mockRejectedValue(new Error('Vonage error'));

    await join();

    expect(result.current.state).toMatchObject({ status: 'failed', failure: 'unknown' });
    expect(client.deleteSession).toHaveBeenCalled();
    expect(listenerCount()).toBe(0);
  });

  it('hangs up the call and closes the session', async () => {
    const { client, listenerCount, result, join } = renderCall();

    await join();
    await act(() => result.current.hangup());

    expect(client.hangup).toHaveBeenCalledWith('call-1');
    expect(result.current.state).toMatchObject({ status: 'ended', endedBy: 'local' });
    expect(client.deleteSession).toHaveBeenCalled();
    expect(listenerCount()).toBe(0);
  });

  it('ends the call when the other side hangs up', async () => {
    const { client, emit, result, join } = renderCall();

    await join();
    emit('callHangup', 'call-1', null, 'REMOTE_HANGUP');

    expect(result.current.state).toMatchObject({ status: 'ended', endedBy: 'remote' });
    expect(client.deleteSession).toHaveBeenCalled();
  });

  it('mutes and unmutes the call', async () => {
    const { client, emit, result, join } = renderCall();

    await join();
    emit('legStatusUpdate', 'call-1', 'leg-1', 'ANSWERED');
    await act(() => result.current.toggleMute());

    expect(client.mute).toHaveBeenCalledWith('call-1');
    expect(result.current.state.muted).toBe(true);

    await act(() => result.current.toggleMute());

    expect(client.unmute).toHaveBeenCalledWith('call-1');
    expect(result.current.state.muted).toBe(false);
  });

  it('keeps the muted state when Vonage cannot mute', async () => {
    const { client, result, join } = renderCall();
    client.mute.mockRejectedValue(new Error('Vonage error'));

    await join();
    await act(() => result.current.toggleMute());

    expect(result.current.state.muted).toBe(false);
  });

  it.each([
    ['media', 'callMediaReconnecting', 'callMediaReconnection'],
    ['session', 'reconnecting', 'reconnection'],
  ] as const)('shows the %s reconnecting and connects again', async (_kind, lost, back) => {
    const { emit, result, join } = renderCall();

    await join();
    emit('legStatusUpdate', 'call-1', 'leg-1', 'ANSWERED');
    emit(lost, 'call-1');

    expect(result.current.state.status).toBe('reconnecting');

    emit(back, 'call-1');

    expect(result.current.state.status).toBe('connected');
  });

  it.each([
    ['EXPIRED_TOKEN', 'session_expired'],
    ['TRANSPORT_CLOSED', 'no_connection'],
  ] as const)('fails when the session ends with %s', async (reason, failure) => {
    const { emit, result, join } = renderCall();

    await join();
    emit('sessionError', reason);

    expect(result.current.state).toMatchObject({ status: 'failed', failure });
  });

  it('fails without connection when the call media disconnects', async () => {
    const { emit, result, join } = renderCall();

    await join();
    emit('callMediaDisconnect', 'call-1', 'networkChange');

    expect(result.current.state).toMatchObject({ status: 'failed', failure: 'no_connection' });
  });

  it('refreshes the session with a new token before it expires', async () => {
    server.use(
      tokenAnswers(
        { token: 'token-1', expiresInMs: TOKEN_REFRESH_MARGIN_MS + 50 },
        { token: 'token-2', expiresInMs: 15 * 60_000 },
      ),
    );
    const { client, join } = renderCall();

    await join();

    await waitFor(() => expect(client.refreshSession).toHaveBeenCalledWith('token-2'));
    expect(tokenBodies).toEqual([{ incidentId: INCIDENT_ID }, { incidentId: INCIDENT_ID }]);
  });

  it('hangs up and closes the session when the page goes away mid-call', async () => {
    const { client, join, unmount } = renderCall();

    await join();
    unmount();

    expect(client.hangup).toHaveBeenCalledWith('call-1');
    expect(client.deleteSession).toHaveBeenCalled();
  });
});
