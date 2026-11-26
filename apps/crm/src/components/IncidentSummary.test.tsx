import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { buildEvent, buildIncidentDetail } from '../test/incident-detail';
import { renderWithIntl } from '../test/render';

import { IncidentSummary } from './IncidentSummary';

describe('IncidentSummary', () => {
  it('shows the incident, the order, the customer and the driver', () => {
    renderWithIntl(<IncidentSummary incident={buildIncidentDetail()} />);

    expect(screen.getByText('Not delivered')).toBeInTheDocument();
    expect(screen.getByText('Notified')).toBeInTheDocument();
    expect(screen.getByText('Calle Mayor 1, Madrid')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '+34611111111' })).toHaveAttribute(
      'href',
      'tel:+34611111111',
    );
    expect(screen.getByText('Luis Pérez')).toBeInTheDocument();
    expect(screen.getByText('No reply yet')).toBeInTheDocument();
  });

  it('shows the last driver reply, translated when it is a known option', () => {
    const events = [
      buildEvent({ id: 'a', actor: 'driver', reason: 'resolve_with_store' }),
      buildEvent({ id: 'b', actor: 'driver', reason: 'request_mediation' }),
    ];

    renderWithIntl(<IncidentSummary incident={buildIncidentDetail({ events })} />, {
      locale: 'es',
    });

    expect(screen.getByText(/Pide una llamada a tres/)).toBeInTheDocument();
    expect(screen.queryByText(/Lo resuelve con la tienda/)).not.toBeInTheDocument();
  });

  it('shows an unknown driver reply as it is', () => {
    const events = [buildEvent({ actor: 'driver', reason: 'free text' })];

    renderWithIntl(<IncidentSummary incident={buildIncidentDetail({ events })} />);

    expect(screen.getByText(/free text/)).toBeInTheDocument();
  });

  it('says when the incident has no driver', () => {
    renderWithIntl(<IncidentSummary incident={buildIncidentDetail({ driver: null })} />);

    expect(screen.getByText('No driver assigned')).toBeInTheDocument();
  });
});
