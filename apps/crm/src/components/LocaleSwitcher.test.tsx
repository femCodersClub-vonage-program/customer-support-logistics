import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { setLocale } from '../i18n/actions';
import { renderWithIntl } from '../test/render';

import { LocaleSwitcher } from './LocaleSwitcher';

vi.mock('../i18n/actions', () => ({
  setLocale: vi.fn(),
}));

describe('LocaleSwitcher', () => {
  beforeEach(() => {
    vi.mocked(setLocale).mockReset().mockResolvedValue(undefined);
  });

  it('shows the active locale with a translated label', () => {
    renderWithIntl(<LocaleSwitcher />, { locale: 'es' });

    expect(screen.getByLabelText('Idioma')).toHaveValue('es');
  });

  it('lists every language in its own name', () => {
    renderWithIntl(<LocaleSwitcher />);

    expect(screen.getByRole('option', { name: 'Español' })).toHaveAttribute('lang', 'es');
    expect(screen.getByRole('option', { name: 'English' })).toHaveAttribute('lang', 'en');
  });

  it('saves the chosen locale through the server action', async () => {
    renderWithIntl(<LocaleSwitcher />, { locale: 'es' });

    fireEvent.change(screen.getByLabelText('Idioma'), { target: { value: 'en' } });

    await waitFor(() => expect(setLocale).toHaveBeenCalledWith('en'));
  });
});
