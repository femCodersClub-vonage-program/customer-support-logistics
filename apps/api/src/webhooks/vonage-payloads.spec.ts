import { describe, expect, it } from 'vitest';

import {
  incidentIdFromCustomData,
  voiceEventSchema,
  voiceInputQuerySchema,
} from './vonage-payloads.js';

const INCIDENT_ID = '00000000-0000-4000-8000-000000000102';

describe('incidentIdFromCustomData', () => {
  it('reads the incident id from an object or from a JSON string', () => {
    expect(incidentIdFromCustomData({ incidentId: INCIDENT_ID })).toBe(INCIDENT_ID);
    expect(incidentIdFromCustomData(JSON.stringify({ incidentId: INCIDENT_ID }))).toBe(INCIDENT_ID);
  });

  it.each([undefined, null, '', 'not json', '{}', { incidentId: 'nope' }, [INCIDENT_ID]])(
    'returns null for %j',
    (value) => {
      expect(incidentIdFromCustomData(value)).toBeNull();
    },
  );
});

describe('voiceEventSchema', () => {
  it('coerces the duration Vonage sends as a string and keeps unknown fields', () => {
    expect(
      voiceEventSchema.parse({ uuid: 'call-1', status: 'completed', duration: '42', rate: '0.1' }),
    ).toEqual({ uuid: 'call-1', status: 'completed', duration: 42, rate: '0.1' });
  });

  it('accepts events without duration', () => {
    expect(voiceEventSchema.parse({ uuid: 'call-1', status: 'ringing' })).toEqual({
      uuid: 'call-1',
      status: 'ringing',
    });
  });
});

describe('voiceInputQuerySchema', () => {
  it('keeps a valid incident id and drops an invalid one instead of failing', () => {
    expect(voiceInputQuerySchema.parse({ incident: INCIDENT_ID })).toEqual({
      incident: INCIDENT_ID,
    });
    expect(voiceInputQuerySchema.parse({ incident: '1234' })).toEqual({ incident: undefined });
    expect(voiceInputQuerySchema.parse({})).toEqual({});
  });
});
