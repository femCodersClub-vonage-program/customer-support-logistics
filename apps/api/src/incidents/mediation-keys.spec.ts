import { describe, expect, it } from 'vitest';

import { mediationKeys, parseMediationCallKey } from './mediation-keys.js';

const incidentId = '0b7f6c1e-3d2a-4f5b-9c8d-7e6f5a4b3c2d';

describe('parseMediationCallKey', () => {
  it('reads the incident and the attempt of a mediation call key', () => {
    expect(parseMediationCallKey(mediationKeys.call(incidentId, 2))).toEqual({
      incidentId,
      attempt: 2,
    });
  });

  it.each([
    null,
    'notify-again-123',
    mediationKeys.callSoon(incidentId),
    mediationKeys.callFallback(incidentId),
    `mediation:${incidentId}:call:0`,
  ])('ignores %s', (key) => {
    expect(parseMediationCallKey(key)).toBeNull();
  });
});
