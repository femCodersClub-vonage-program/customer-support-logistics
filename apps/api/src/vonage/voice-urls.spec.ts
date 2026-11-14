import { describe, expect, it } from 'vitest';

import { buildVoiceInputUrl } from './voice-urls.js';

const INCIDENT_ID = '0b7c8e3a-4f1d-4c2e-9a6b-2d5e8f1a3c7b';

describe('buildVoiceInputUrl', () => {
  it('points to the voice input webhook with the incident id', () => {
    expect(buildVoiceInputUrl('https://example.ngrok-free.app', INCIDENT_ID)).toBe(
      `https://example.ngrok-free.app/webhooks/voice/input?incident=${INCIDENT_ID}`,
    );
  });

  it('ignores any path already in the public URL', () => {
    expect(buildVoiceInputUrl('https://example.ngrok-free.app/api/', INCIDENT_ID)).toBe(
      `https://example.ngrok-free.app/webhooks/voice/input?incident=${INCIDENT_ID}`,
    );
  });
});
