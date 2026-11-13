import { createHash, createHmac, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

const ROUTES = {
  'messages-inbound-sms': ['POST', '/webhooks/sms/inbound'],
  'messages-status-delivered': ['POST', '/webhooks/sms/status'],
  'voice-answer-app': ['GET', '/webhooks/voice/answer'],
  'voice-answer-driver': ['GET', '/webhooks/voice/answer'],
  'voice-event-answered': ['POST', '/webhooks/voice/event'],
  'voice-event-completed': ['POST', '/webhooks/voice/event'],
  'voice-input-dtmf': ['POST', '/webhooks/voice/input'],
};

const [fixture, ...assignments] = process.argv.slice(2);
const route = ROUTES[fixture];

if (route === undefined) {
  console.error(`Usage: node --env-file=.env scripts/replay-vonage-webhook.mjs <fixture> [field=value ...]
Fixtures: ${Object.keys(ROUTES).join(', ')}
"incident=<uuid>" goes to the query string of voice-input-dtmf; other fields override the payload.`);
  process.exit(1);
}

const secret = process.env.VONAGE_SIGNATURE_SECRET;

if (!secret) {
  console.error('VONAGE_SIGNATURE_SECRET is not set');
  process.exit(1);
}

const [method, path] = route;
const payload = JSON.parse(
  readFileSync(new URL(`../test/fixtures/vonage/${fixture}.json`, import.meta.url), 'utf8'),
);
const url = new URL(
  path,
  process.env.REPLAY_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`,
);

for (const assignment of assignments) {
  const [key, ...rest] = assignment.split('=');
  const value = rest.join('=');

  if (key === 'incident') {
    url.searchParams.set('incident', value);
  } else {
    payload[key] = value;
  }
}

if (fixture.startsWith('messages-')) {
  payload.message_uuid = randomUUID();
}

const body = method === 'POST' ? JSON.stringify(payload) : undefined;

if (method === 'GET') {
  for (const [key, value] of Object.entries(payload)) {
    url.searchParams.set(key, String(value));
  }
}

const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const claims = {
  iat: Math.floor(Date.now() / 1000),
  jti: randomUUID(),
  iss: 'Vonage',
  ...(process.env.VONAGE_API_KEY ? { api_key: process.env.VONAGE_API_KEY } : {}),
  ...(body === undefined ? {} : { payload_hash: createHash('sha256').update(body).digest('hex') }),
};
const unsigned = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(claims)}`;
const token = `${unsigned}.${createHmac('sha256', secret).update(unsigned).digest('base64url')}`;

const response = await fetch(url, {
  method,
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body,
});

console.log(`${method} ${url.pathname}${url.search} -> ${response.status}`);
const text = await response.text();

if (text) {
  console.log(text);
}
