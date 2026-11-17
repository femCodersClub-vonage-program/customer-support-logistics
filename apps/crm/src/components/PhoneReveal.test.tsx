import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithIntl } from '../test/render';

import { PhoneReveal } from './PhoneReveal';

describe('PhoneReveal', () => {
  it('masks the phone number initially', () => {
    renderWithIntl(<PhoneReveal phone="+34612345678" />, { locale: 'es' });

    expect(screen.getByText('****5678')).toBeInTheDocument();
    expect(screen.queryByText('+34612345678')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mostrar teléfono' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('reveals and hides the phone number when requested', () => {
    renderWithIntl(<PhoneReveal phone="+34612345678" />, { locale: 'es' });

    fireEvent.click(screen.getByRole('button', { name: 'Mostrar teléfono' }));

    expect(screen.getByText('+34612345678')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ocultar teléfono' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Ocultar teléfono' }));

    expect(screen.getByText('****5678')).toBeInTheDocument();
    expect(screen.queryByText('+34612345678')).not.toBeInTheDocument();
  });
});
