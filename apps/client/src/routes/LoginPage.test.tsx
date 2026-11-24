import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { RESEND_AFTER_SECONDS } from '../auth/CodeStep.tsx';
import { CUSTOMER, apiError, apiUrl, ordersOf, renderApp, sessionOf } from '../test/app.tsx';

const ORDER_ID = '3c4d5e6f-0000-4000-8000-000000000001';
const REPORT_PATH = `/report/${ORDER_ID}`;

const server = setupServer(ordersOf());

let startBodies: unknown[] = [];

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
  server.use(
    sessionOf(null),
    startAnswers({ channel: 'sms' }),
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
    renderApp(`/login?next=${encodeURIComponent(REPORT_PATH)}`);

    await sendPhone('600 000 001');

    expect(await screen.findByRole('heading', { name: 'Enter the code' })).toBeInTheDocument();
    expect(screen.getByText("We've sent a code by SMS to +34600000001.")).toBeInTheDocument();
    expect(startBodies).toEqual([{ phone: '+34600000001' }]);
    expect(screen.getByLabelText('Code')).toHaveAttribute('autocomplete', 'one-time-code');
    expect(screen.getByLabelText('Code')).toHaveFocus();

    await sendCode('123456');

    expect(await screen.findByRole('heading', { name: 'Report an incident' })).toBeInTheDocument();
    expect(screen.getByText(`Order ${ORDER_ID}`)).toBeInTheDocument();
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
    vi.useFakeTimers({
      shouldAdvanceTime: true,
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
    });
    renderApp('/login');
    await sendPhone('600 000 001');

    const resend = await screen.findByRole('button', { name: 'Send a new code' });
    expect(resend).toBeDisabled();

    await act(() => vi.advanceTimersByTimeAsync(RESEND_AFTER_SECONDS * 1000));

    expect(resend).toBeEnabled();
    fireEvent.click(resend);

    await waitFor(() => expect(startBodies).toHaveLength(2));
    expect(await screen.findByText('You can ask for a new code in 3:00.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send a new code' })).toBeDisabled();
  });

  it.each([
    ['VERIFICATION_EXPIRED', 'The code has expired'],
    ['TOO_MANY_ATTEMPTS', 'Too many wrong codes'],
  ])('lets the customer ask for a new code at once after %s', async (code, message) => {
    server.use(checkAnswers(() => apiError(410, code)));
    renderApp('/login');
    await sendPhone('600 000 001');
    await sendCode('000000');

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(message));
    expect(screen.getByRole('button', { name: 'Send a new code' })).toBeEnabled();
  });

  it('calls a code the API rejects as malformed a wrong code, not a wrong phone', async () => {
    server.use(checkAnswers(() => apiError(400, 'VALIDATION_FAILED')));
    renderApp('/login');
    await sendPhone('600 000 001');
    await sendCode('12 34');

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent("That code isn't right"),
    );
  });

  it('comes back to the protected page the customer asked for', async () => {
    renderApp(`${REPORT_PATH}?from=sms`);

    await sendPhone('600 000 001');
    await sendCode('123456');

    expect(await screen.findByRole('heading', { name: 'Report an incident' })).toBeInTheDocument();
    expect(screen.getByText(`Order ${ORDER_ID}`)).toBeInTheDocument();
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
