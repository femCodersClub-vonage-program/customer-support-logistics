import { ApiError } from '@csl/api-client';
import { revalidatePath } from 'next/cache';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { serverApi } from '../../../../lib/api.server';
import { IDLE_STATE } from '../../../../lib/mediation';
import { INCIDENT_ID } from '../../../../test/incident-detail';

import { callDriverAgain, closeMediation, startMediation } from './actions';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('../../../../lib/api.server', () => ({
  serverApi: {
    startMediation: vi.fn(),
    callDriver: vi.fn(),
    changeIncidentStatus: vi.fn(),
  },
}));

function formData(entries: Record<string, string>) {
  const data = new FormData();

  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }

  return data;
}

describe('mediation actions', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('starts the mediation and revalidates the incident pages', async () => {
    await expect(startMediation(INCIDENT_ID)).resolves.toEqual(IDLE_STATE);

    expect(serverApi.startMediation).toHaveBeenCalledWith(INCIDENT_ID);
    expect(revalidatePath).toHaveBeenCalledWith(`/incidents/${INCIDENT_ID}`, 'layout');
  });

  it('returns the error and does not revalidate when the API fails', async () => {
    vi.mocked(serverApi.callDriver).mockRejectedValue(
      new ApiError('failed', 502, { error: { code: 'BAD_GATEWAY', message: 'Vonage' } }),
    );

    await expect(callDriverAgain(INCIDENT_ID)).resolves.toEqual({ error: 'BAD_GATEWAY' });

    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('closes the mediation with the status built from the outcome', async () => {
    await expect(
      closeMediation(
        INCIDENT_ID,
        IDLE_STATE,
        formData({ outcome: 'follow_up_needed', note: 'Tomorrow' }),
      ),
    ).resolves.toEqual(IDLE_STATE);

    expect(serverApi.changeIncidentStatus).toHaveBeenCalledWith(INCIDENT_ID, {
      status: 'escalated',
      reason: 'follow_up_needed: Tomorrow',
    });
  });

  it.each([
    [{ note: 'No outcome' }],
    [{ outcome: 'open' }],
    [{ outcome: 'resolved', note: 'x'.repeat(901) }],
  ])('rejects an invalid form %o without calling the API', async (entries) => {
    await expect(closeMediation(INCIDENT_ID, IDLE_STATE, formData(entries))).resolves.toEqual({
      error: 'INVALID_OUTCOME',
    });

    expect(serverApi.changeIncidentStatus).not.toHaveBeenCalled();
  });
});
