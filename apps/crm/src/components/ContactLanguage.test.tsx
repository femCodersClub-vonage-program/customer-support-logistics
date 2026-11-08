import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithIntl } from '../test/render';

import { ContactLanguage } from './ContactLanguage';

describe('ContactLanguage', () => {
  it('names the customer language in the agent language', () => {
    renderWithIntl(<ContactLanguage role="customer" locale="en" />, { locale: 'es' });

    expect(screen.getByText('Idioma del cliente: Inglés')).toBeInTheDocument();
  });

  it('names the driver language in English for an English-speaking agent', () => {
    renderWithIntl(<ContactLanguage role="driver" locale="es" />, { locale: 'en' });

    expect(screen.getByText('Driver’s language: Spanish')).toBeInTheDocument();
  });
});
