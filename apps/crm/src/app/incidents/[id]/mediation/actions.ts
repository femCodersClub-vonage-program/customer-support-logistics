'use server';

import { revalidatePath } from 'next/cache';

import { serverApi } from '../../../../lib/api.server';
import {
  IDLE_STATE,
  MEDIATION_NOTE_MAX_LENGTH,
  isMediationOutcome,
  outcomeToStatusBody,
  toMediationError,
} from '../../../../lib/mediation';

import type { MediationActionState } from '../../../../lib/mediation';

async function run(
  incidentId: string,
  call: () => Promise<unknown>,
): Promise<MediationActionState> {
  try {
    await call();
  } catch (error) {
    return { error: toMediationError(error) };
  }

  revalidatePath(`/incidents/${incidentId}`, 'layout');

  return IDLE_STATE;
}

export async function startMediation(incidentId: string): Promise<MediationActionState> {
  return run(incidentId, () => serverApi.startMediation(incidentId));
}

export async function callDriverAgain(incidentId: string): Promise<MediationActionState> {
  return run(incidentId, () => serverApi.callDriver(incidentId));
}

export async function closeMediation(
  incidentId: string,
  _state: MediationActionState,
  formData: FormData,
): Promise<MediationActionState> {
  const outcome = formData.get('outcome');
  const note = formData.get('note');

  if (
    !isMediationOutcome(outcome) ||
    (note !== null && typeof note !== 'string') ||
    (note?.length ?? 0) > MEDIATION_NOTE_MAX_LENGTH
  ) {
    return { error: 'INVALID_OUTCOME' };
  }

  return run(incidentId, () =>
    serverApi.changeIncidentStatus(incidentId, outcomeToStatusBody(outcome, note ?? '')),
  );
}
