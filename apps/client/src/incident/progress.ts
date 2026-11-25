import type { IncidentDetail } from '@csl/contracts';
import type { IncidentStatus } from '@csl/shared-types';

export type ProgressStepId = 'reported' | 'notified' | 'in_mediation' | 'resolved' | 'escalated';

export type ProgressStepState = 'done' | 'current' | 'upcoming';

export interface ProgressStep {
  id: ProgressStepId;
  state: ProgressStepState;
}

export type NextStepMessage = IncidentStatus | 'in_mediation_call';

const CURRENT_STEP: Record<IncidentStatus, number> = {
  open: 0,
  notified: 1,
  in_mediation: 2,
  resolved: 3,
  escalated: 3,
};

function stateOf(index: number, current: number): ProgressStepState {
  if (index < current) {
    return 'done';
  }

  return index === current ? 'current' : 'upcoming';
}

export function progressSteps(status: IncidentStatus): ProgressStep[] {
  const current = CURRENT_STEP[status];
  const ids: ProgressStepId[] = [
    'reported',
    'notified',
    'in_mediation',
    status === 'escalated' ? 'escalated' : 'resolved',
  ];

  return ids.map((id, index) => ({ id, state: stateOf(index, current) }));
}

export function canJoinCall({
  status,
  mediationInvite,
}: Pick<IncidentDetail, 'status' | 'mediationInvite'>): boolean {
  return status === 'in_mediation' && mediationInvite !== null;
}

export function nextStepMessage(
  incident: Pick<IncidentDetail, 'status' | 'mediationInvite'>,
): NextStepMessage {
  return canJoinCall(incident) ? 'in_mediation_call' : incident.status;
}
