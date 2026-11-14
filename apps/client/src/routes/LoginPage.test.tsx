import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { RESEND_AFTER_SECONDS } from '../auth/CodeStep.tsx';
import { CUSTOMER, apiError, apiUrl, renderApp, sessionOf } from '../test/app.tsx';

const server = setupServer();

let startBodies: unknown[] = [];
let smsCalls = 0;

const startAnswers = (body: object) =>
  http.post(apiUrl('/auth/customer/start'), async ({ request }) => {
    startBodies.push(await request.json());
    return HttpResponse.json(body);
  });

const checkAnswers = (response: () => Response) =>
  http.post(apiUrl('/auth/customer/check'), response);

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
beforeEach(() => {
  startBodies = [];
  smsCalls = 0;
  server.use(
    sessionOf(null),
    startAnswers({ channel: 'sms' }),
    http.post(apiUrl('/auth/customer/sms'), () => {
      smsCalls += 1;
      return new HttpResponse(null, { status: 204 });
    }),
    checkAnswers(() => HttpResponse.json(CUSTOMER)),
  );
});
afterEach(() => {
  server.resetHandlers();
  vi.useRealTimers();
});
afterAll(() => server.close());

const sendPhone = async (number: string, country = 'ES') => {
  fireEvent.change(await screen.findByLabelText('Country'), { target: { value: country } });
  fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: number } });
  fireEvent.click(screen.getByRole('button', { name: 'Send code' }));
};

const sendCode = async (code: string) => {
  fireEvent.change(await screen.findByLabelText('Code'), { target: { value: code } });
  fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
};

describe('LoginPage', () => {
  it('sends the code to the phone in E.164 and goes to the page the customer came from', async () => {
    renderApp('/login?next=%2Freport%2F42');

    await sendPhone('600 000 001');

    expect(await screen.findByRole('heading', { name: 'Enter the code' })).toBeInTheDocument();
    expect(screen.getByText("We've sent a code by SMS to +34600000001.")).toBeInTheDocument();
    expect(startBodies).toEqual([{ phone: '+34600000001' }]);
    expect(screen.getByLabelText('Code')).toHaveAttribute('autocomplete', 'one-time-code');
    expect(screen.getByLabelText('Code')).toHaveFocus();

    await sendCode('123456');

    expect(await screen.findByRole('heading', { name: 'Report an incident' })).toBeInTheDocument();
    expect(screen.getByText('Order 42')).toBeInTheDocument();
  });

  it('asks for the SMS at once when the API offers silent authentication', async () => {
    server.use(startAnswers({ channel: 'silent_auth', checkUrl: 'https://verify.test/check' }));
    renderApp('/login');

    await sendPhone('600 000 001');

    expect(await screen.findByRole('heading', { name: 'Enter the code' })).toBeInTheDocument();
    expect(smsCalls).toBe(1);
  });

  it('checks the phone before calling the API', async () => {
    renderApp('/login');

    await sendPhone('123');

    expect(await screen.findByRole('alert')).toHaveTextContent('Check the phone number');
    expect(screen.getByLabelText('Phone number')).toHaveAttribute('aria-invalid', 'true');
    expect(startBodies).toEqual([]);
  });

  it.each([
    [401, 'INVALID_CODE', "That code isn't right"],
    [410, 'VERIFICATION_EXPIRED', 'The code has expired'],
    [410, 'TOO_MANY_ATTEMPTS', 'Too many wrong codes'],
    [429, 'RATE_LIMITED', 'Wait a few minutes'],
  ])('explains a %i %s and stays on the code', async (status, code, message) => {
    server.use(checkAnswers(() => apiError(status, code)));
    renderApp('/login');

    await sendPhone('600 000 001');
    await sendCode('000000');

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(message));
    expect(screen.getByRole('heading', { name: 'Enter the code' })).toBeInTheDocument();
  });

  it('says when there is no connection', async () => {
    server.use(http.post(apiUrl('/auth/customer/start'), () => HttpResponse.error()));
    renderApp('/login');

    await sendPhone('600 000 001');

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent("There's no connection"),
    );
  });

  it('lets the customer ask for a new code only after the countdown', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderApp('/login');
    await sendPhone('600 000 001');

    const resend = await screen.findByRole('button', { name: 'Send a new code' });
    expect(resend).toBeDisabled();

    for (let second = 0; second < RESEND_AFTER_SECONDS; second += 1) {
      act(() => {
        vi.advanceTimersByTime(1000);
      });
    }

    expect(resend).toBeEnabled();
    fireEvent.click(resend);

    await waitFor(() => expect(startBodies).toHaveLength(2));
    expect(screen.getByRole('button', { name: 'Send a new code' })).toBeDisabled();
  });

  it('goes back to the phone to change the number', async () => {
    renderApp('/login');
    await sendPhone('600 000 001');

    fireEvent.click(await screen.findByRole('button', { name: 'Change number' }));

    expect(screen.getByLabelText('Phone number')).toBeInTheDocument();
  });

  it('ignores a next parameter that leaves the app', async () => {
    renderApp('/login?next=https%3A%2F%2Fevil.com');

    await sendPhone('600 000 001');
    await sendCode('123456');

    expect(await screen.findByRole('heading', { name: 'My orders' })).toBeInTheDocument();
  });

  it('logs out from the orders page', async () => {
    let loggedOut = false;
    server.use(
      sessionOf(CUSTOMER),
      http.post(apiUrl('/auth/logout'), () => {
        loggedOut = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderApp('/orders');

    fireEvent.click(await screen.findByRole('button', { name: 'Log out' }));

    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument();
    expect(loggedOut).toBe(true);
  });
});
