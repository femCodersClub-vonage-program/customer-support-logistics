import { z } from 'zod';

import { isVonageEnabled, validateEnv } from '../config/env.schema.js';

import { SdkVonageService } from './sdk-vonage.service.js';
import { createVonageClient } from './vonage.client.js';

const DEFAULT_TEXT = 'Prueba de customer-support-logistics: Vonage funciona.';

const USAGE = 'Usage: vonage:send-test-sms <E.164 phone, e.g. +34600000000> [text]';

const [to, text = DEFAULT_TEXT] = process.argv.slice(2).filter((arg) => arg !== '--');

if (!to || !z.e164().safeParse(to).success) {
  throw new Error(USAGE);
}

if (process.env.NODE_ENV === 'production') {
  throw new Error('Refusing to send a test SMS with NODE_ENV=production');
}

const env = validateEnv(process.env);

if (!isVonageEnabled(env)) {
  throw new Error('Vonage is disabled: set VONAGE_ENABLED=true and the Vonage credentials');
}

const service = new SdkVonageService(
  createVonageClient({
    apiKey: env.VONAGE_API_KEY ?? '',
    apiSecret: env.VONAGE_API_SECRET ?? '',
    applicationId: env.VONAGE_APPLICATION_ID ?? '',
    privateKey: env.VONAGE_PRIVATE_KEY ?? '',
  }),
  env.VONAGE_VIRTUAL_NUMBER ?? '',
);

const { messageId } = await service.sendSms(to, text);

console.log(`Test SMS sent, message id ${messageId}`);
