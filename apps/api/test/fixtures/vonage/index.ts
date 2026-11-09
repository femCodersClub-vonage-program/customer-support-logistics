import { readFileSync } from 'node:fs';

export const VONAGE_FIXTURES = [
  'messages-inbound-sms',
  'messages-status-delivered',
  'voice-answer-app',
  'voice-answer-driver',
  'voice-event-answered',
  'voice-event-completed',
  'voice-input-dtmf',
] as const;

export type VonageFixture = (typeof VONAGE_FIXTURES)[number];

export function vonageFixture(
  name: VonageFixture,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const payload = JSON.parse(
    readFileSync(new URL(`./${name}.json`, import.meta.url), 'utf8'),
  ) as Record<string, unknown>;

  return { ...payload, ...overrides };
}
