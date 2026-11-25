export const MEDIATION_CALL_ATTEMPTS = 3;

const CALL_KEY_PATTERN = /^mediation:([0-9a-f-]{36}):call:([1-9][0-9]*)$/;

export const mediationKeys = {
  callSoon: (incidentId: string) => `mediation:${incidentId}:call-soon`,
  invite: (incidentId: string) => `mediation:${incidentId}:invite`,
  call: (incidentId: string, attempt: number) => `mediation:${incidentId}:call:${attempt}`,
  callPattern: (incidentId: string) => `mediation:${incidentId}:call:%`,
  callFallback: (incidentId: string) => `mediation:${incidentId}:call-fallback`,
};

export function parseMediationCallKey(
  key: string | null,
): { incidentId: string; attempt: number } | null {
  const match = key === null ? null : CALL_KEY_PATTERN.exec(key);

  if (!match) {
    return null;
  }

  return { incidentId: match[1]!, attempt: Number(match[2]) };
}
