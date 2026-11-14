import { fireEvent, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { goTo, isOnWifi } from '../auth/browser.ts';
import { savePendingLogin } from '../auth/pending-login.ts';
import { CUSTOMER, apiError, apiUrl, renderApp, sessionOf } from '../test/app.tsx';

vi.mock('../auth/browser.ts', () => ({ goTo: vi.fn(), isOnWifi: vi.fn(() => false) }));

const CHECK_URL = 'https://verify.test/silent-auth/req-1';
const server = setupServer();

let smsCalls = 0;
let checkBodies: unknown[] = [];

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
beforeEach(() => {
  smsCalls = 0;
  checkBodies = [];
  sessionStorage.clear();
  vi.mocked(goTo).mockReset();
  vi.mocked(isOnWifi).mockReturnValue(false);
  window.history.replaceState(null, '', '/');
  server.use(
    sessionOf(null),
    http.post(apiUrl('/auth/customer/start'), () =>
      HttpResponse.json({ channel: 'silent_auth', checkUrl: CHECK_URL }),
    ),
    http.post(apiUrl('/auth/customer/sms'), () => {
      smsCalls += 1;
      return new HttpResponse(null, { status: 204 });
    }),
    http.post(apiUrl('/auth/customer/check'), async ({ request }) => {
      checkBodies.push(await request.json());
      return HttpResponse.json(CUSTOMER);
    }),
  );
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const sendPhone = async () => {
  fireEvent.change(await screen.findByLabelText('Phone number'), {
    target: { value: '600 000 001' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Send code' }));
};

describe('Login with silent authentication', () => {
  it('navigates to the check URL and keeps the phone and the way back', async () => {
    renderApp('/login?next=%2Freport%2F42');

    await sendPhone();

    await waitFor(() => expect(goTo).toHaveBeenCalledWith(CHECK_URL));
    expect(JSON.parse(sessionStorage.getItem('csl.pendingLogin') ?? 'null')).toEqual({
      phone: '+34600000001',
      next: '/report/42',
    });
    expect(smsCalls).toBe(0);
  });

  it('asks for the SMS at once on Wi-Fi, where silent authentication always fails', async () => {
    vi.mocked(isOnWifi).mockReturnValue(true);
    renderApp('/login');

    await sendPhone();

    expect(await screen.findByRole('heading', { name: 'Enter the code' })).toBeInTheDocument();
    expect(smsCalls).toBe(1);
    expect(goTo).not.toHaveBeenCalled();
  });

  describe('/login/callback', () => {
    beforeEach(() => {
      savePendingLogin({ phone: '+34600000001', next: '/report/42' });
    });

    it('checks the code and request id from the fragment and goes back', async () => {
      window.history.replaceState(null, '', '/login/callback#request_id=req-1&code=si9sfG');
      renderApp('/login/callback');

      expect(
        await screen.findByRole('heading', { name: 'Report an incident' }),
      ).toBeInTheDocument();
      expect(checkBodies).toEqual([{ code: 'si9sfG', requestId: 'req-1' }]);
      expect(sessionStorage.getItem('csl.pendingLogin')).toBeNull();
    });

    it('asks for the SMS and shows the code step when the fragment has no code', async () => {
      window.history.replaceState(null, '', '/login/callback#error=network');
      renderApp('/login/callback');

      expect(await screen.findByRole('heading', { name: 'Enter the code' })).toBeInTheDocument();
      expect(screen.getByText("We've sent a code by SMS to +34600000001.")).toBeInTheDocument();
      expect(smsCalls).toBe(1);
      expect(checkBodies).toEqual([]);
    });

    it('falls back to the SMS when the silent auth code is rejected', async () => {
      server.use(http.post(apiUrl('/auth/customer/check'), () => apiError(401, 'INVALID_CODE')));
      window.history.replaceState(null, '', '/login/callback#request_id=req-1&code=bad');
      renderApp('/login/callback');

      expect(await screen.findByRole('heading', { name: 'Enter the code' })).toBeInTheDocument();
      expect(smsCalls).toBe(1);
    });

    it('starts over when there is no pending login', async () => {
      sessionStorage.clear();
      window.history.replaceState(null, '', '/login/callback');
      renderApp('/login/callback');

      expect(await screen.findByLabelText('Phone number')).toBeInTheDocument();
      expect(smsCalls).toBe(0);
    });
  });
});
