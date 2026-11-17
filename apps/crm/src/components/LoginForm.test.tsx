import { ApiError } from '@csl/api-client';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../lib/api';
import { renderWithIntl } from '../test/render';

import { LoginForm } from './LoginForm';

const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('../lib/api', () => ({ api: { agentLogin: vi.fn() } }));

const logIn = (email: string, password: string) => {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
};

describe('LoginForm', () => {
  beforeEach(() => {
    vi.mocked(api.agentLogin).mockReset();
    router.replace.mockReset();
    router.refresh.mockReset();
  });

  it('logs the agent in and goes to the page they asked for', async () => {
    vi.mocked(api.agentLogin).mockResolvedValue({ role: 'agent', id: 'a1', name: 'Marta' });
    renderWithIntl(<LoginForm next="/incidents/1" />);

    logIn('marta.vidal@example.com', 'a long password');

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/incidents/1'));
    expect(api.agentLogin).toHaveBeenCalledWith({
      email: 'marta.vidal@example.com',
      password: 'a long password',
    });
    expect(router.refresh).toHaveBeenCalled();
    expect(screen.getByLabelText('Email')).toHaveAttribute('autocomplete', 'username');
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'current-password');
  });

  it.each([
    [new ApiError('x', 401, { error: { code: 'UNAUTHORIZED' } }), "isn't right"],
    [new ApiError('x', 429, { error: { code: 'RATE_LIMITED' } }), 'Too many attempts'],
    [new TypeError('Failed to fetch'), "There's no connection"],
  ])('explains %s and stays on the form', async (error, message) => {
    vi.mocked(api.agentLogin).mockRejectedValue(error);
    renderWithIntl(<LoginForm next="/inbox" />);

    logIn('marta.vidal@example.com', 'wrong');

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(message));
    expect(router.replace).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Log in' })).toBeEnabled();
  });
});
