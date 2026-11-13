import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { closeMediation } from '../app/incidents/[id]/mediation/actions';
import { IDLE_STATE } from '../lib/mediation';
import { INCIDENT_ID } from '../test/incident-detail';
import { renderWithIntl } from '../test/render';

import { MediationOutcomeForm } from './MediationOutcomeForm';

vi.mock('../app/incidents/[id]/mediation/actions', () => ({
  closeMediation: vi.fn(),
}));

describe('MediationOutcomeForm', () => {
  beforeEach(() => {
    vi.mocked(closeMediation).mockReset().mockResolvedValue(IDLE_STATE);
  });

  it('sends the outcome and the note for the incident', async () => {
    renderWithIntl(<MediationOutcomeForm incidentId={INCIDENT_ID} />);

    fireEvent.click(screen.getByLabelText('Follow-up needed'));
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Call back tomorrow' } });
    fireEvent.click(screen.getByRole('button', { name: 'Close mediation' }));

    await waitFor(() => expect(closeMediation).toHaveBeenCalled());

    const [incidentId, , formData] = vi.mocked(closeMediation).mock.calls[0] ?? [];

    expect(incidentId).toBe(INCIDENT_ID);
    expect(formData?.get('outcome')).toBe('follow_up_needed');
    expect(formData?.get('note')).toBe('Call back tomorrow');
  });

  it('shows the error returned by the action', async () => {
    vi.mocked(closeMediation).mockResolvedValue({ error: 'INVALID_TRANSITION' });

    renderWithIntl(<MediationOutcomeForm incidentId={INCIDENT_ID} />);

    fireEvent.click(screen.getByLabelText('Resolved'));
    fireEvent.click(screen.getByRole('button', { name: 'Close mediation' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The incident changed in the meantime. Reload the page and try again.',
    );
  });

  it('offers the outcomes in Spanish', () => {
    renderWithIntl(<MediationOutcomeForm incidentId={INCIDENT_ID} />, { locale: 'es' });

    expect(screen.getByLabelText('Resuelta')).toBeInTheDocument();
    expect(screen.getByLabelText('Escalada')).toBeInTheDocument();
    expect(screen.getByLabelText('Necesita seguimiento')).toBeInTheDocument();
  });
});
