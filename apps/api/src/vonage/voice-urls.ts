import type { Incident } from '@csl/shared-types';

export const VOICE_INPUT_PATH = '/webhooks/voice/input';

export function buildVoiceInputUrl(publicUrl: string, incidentId: Incident['id']): string {
  const url = new URL(VOICE_INPUT_PATH, publicUrl);
  url.searchParams.set('incident', incidentId);

  return url.toString();
}

export function buildCallUrl(clientPublicUrl: string, incidentId: Incident['id']): string {
  return new URL(`/call/${incidentId}`, clientPublicUrl).toString();
}
