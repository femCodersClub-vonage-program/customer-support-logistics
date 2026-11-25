import { INCIDENT_TYPES, SUPPORTED_LOCALES } from '@csl/shared-types';
import { describe, expect, it } from 'vitest';

import { measureSms } from '../vonage/sms-segments.js';

import {
  callFallbackSms,
  callSoonSms,
  escalatedCustomerSms,
  incidentNoticeSms,
  invalidReplySms,
  mediationInviteSms,
  resolvedCustomerSms,
  resolvedDriverSms,
} from './sms-templates.js';

import type { Locale } from '@csl/shared-types';

const orderId = 'A1B2C3D4';

const inviteUrl =
  'https://client-production-8cd55b5b.up.railway.app/call/0b7f6c1e-3d2a-4f5b-9c8d-7e6f5a4b3c2d';

function allTemplates(locale: Locale) {
  return {
    ...Object.fromEntries(
      INCIDENT_TYPES.map((incidentType) => [
        `incidentNotice:${incidentType}`,
        incidentNoticeSms(locale, { orderId, incidentType }),
      ]),
    ),
    callSoon: callSoonSms(locale, { orderId, minutes: 2 }),
    callFallback: callFallbackSms(locale, { orderId }),
    mediationInvite: mediationInviteSms(locale, { orderId, url: inviteUrl }),
    invalidReply: invalidReplySms(locale),
    resolvedCustomer: resolvedCustomerSms(locale, { orderId }),
    resolvedDriver: resolvedDriverSms(locale, { orderId }),
    escalatedCustomer: escalatedCustomerSms(locale, { orderId }),
  };
}

describe('SMS templates', () => {
  it('builds the incident notice with the translated incident type', () => {
    expect(incidentNoticeSms('es', { orderId, incidentType: 'damaged' })).toBe(
      'CSL: incidencia en el pedido A1B2C3D4 (Dañado). Responde 1 si lo resuelves con la tienda, 2 para llamada con cliente y soporte.',
    );
    expect(incidentNoticeSms('en', { orderId, incidentType: 'damaged' })).toBe(
      'CSL: incident on order A1B2C3D4 (Damaged). Reply 1 if you solve it with the store, 2 for a call with the customer and support.',
    );
  });

  it('pluralises the minutes until the call', () => {
    expect(callSoonSms('es', { orderId, minutes: 1 })).toBe(
      'CSL: te llamaremos en 1 minuto por la incidencia del pedido A1B2C3D4.',
    );
    expect(callSoonSms('es', { orderId, minutes: 2 })).toBe(
      'CSL: te llamaremos en 2 minutos por la incidencia del pedido A1B2C3D4.',
    );
    expect(callSoonSms('en', { orderId, minutes: 1 })).toBe(
      "CSL: we'll call you in 1 minute about the incident on order A1B2C3D4.",
    );
  });

  it('builds the fallback SMS', () => {
    expect(callFallbackSms('es', { orderId })).toBe(
      'CSL: no hemos podido contactarte por el pedido A1B2C3D4. Te volveremos a llamar.',
    );
    expect(callFallbackSms('en', { orderId })).toBe(
      "CSL: we couldn't reach you about order A1B2C3D4. We'll call you again later.",
    );
  });

  it('builds the mediation invite with the call link', () => {
    expect(mediationInviteSms('es', { orderId, url: inviteUrl })).toBe(
      `CSL: entra a la llamada del pedido A1B2C3D4: ${inviteUrl}`,
    );
    expect(mediationInviteSms('en', { orderId, url: inviteUrl })).toBe(
      `CSL: join the call about order A1B2C3D4: ${inviteUrl}`,
    );
  });

  it('builds the closing SMS for the customer and the driver', () => {
    expect(resolvedCustomerSms('es', { orderId })).toBe(
      'CSL: hemos resuelto la incidencia de tu pedido A1B2C3D4. Gracias por tu paciencia.',
    );
    expect(resolvedDriverSms('es', { orderId })).toBe(
      'CSL: la incidencia del pedido A1B2C3D4 se ha resuelto. Gracias por tu ayuda.',
    );
    expect(escalatedCustomerSms('es', { orderId })).toBe(
      'CSL: seguimos trabajando en la incidencia de tu pedido A1B2C3D4. Te avisaremos por SMS.',
    );
    expect(resolvedCustomerSms('en', { orderId })).toBe(
      "CSL: we've resolved the incident on your order A1B2C3D4. Thank you for your patience.",
    );
    expect(resolvedDriverSms('en', { orderId })).toBe(
      'CSL: the incident on order A1B2C3D4 has been resolved. Thank you for your help.',
    );
    expect(escalatedCustomerSms('en', { orderId })).toBe(
      "CSL: we're still working on the incident on your order A1B2C3D4. We'll keep you posted by SMS.",
    );
  });

  it('keeps the driver replies numeric in every locale', () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(invalidReplySms(locale)).toMatch(/1 (o|or) 2\.$/);
    }
  });

  it.each(SUPPORTED_LOCALES)('fits every template in one SMS segment in %s', (locale) => {
    for (const [name, text] of Object.entries(allTemplates(locale))) {
      expect({ name, segments: measureSms(text).segments }).toEqual({ name, segments: 1 });
    }
  });

  it('measures each template', () => {
    const measured = Object.fromEntries(
      SUPPORTED_LOCALES.map((locale) => [
        locale,
        {
          incidentNotice: measureSms(
            incidentNoticeSms(locale, { orderId, incidentType: 'wrong_item' }),
          ),
          callSoon: measureSms(callSoonSms(locale, { orderId, minutes: 2 })),
          callFallback: measureSms(callFallbackSms(locale, { orderId })),
          mediationInvite: measureSms(mediationInviteSms(locale, { orderId, url: inviteUrl })),
          invalidReply: measureSms(invalidReplySms(locale)),
          resolvedCustomer: measureSms(resolvedCustomerSms(locale, { orderId })),
          resolvedDriver: measureSms(resolvedDriverSms(locale, { orderId })),
          escalatedCustomer: measureSms(escalatedCustomerSms(locale, { orderId })),
        },
      ]),
    );

    expect(measured).toEqual({
      es: {
        incidentNotice: { encoding: 'GSM-7', length: 140, segments: 1 },
        callSoon: { encoding: 'GSM-7', length: 70, segments: 1 },
        callFallback: { encoding: 'GSM-7', length: 80, segments: 1 },
        mediationInvite: { encoding: 'GSM-7', length: 136, segments: 1 },
        invalidReply: { encoding: 'GSM-7', length: 20, segments: 1 },
        resolvedCustomer: { encoding: 'GSM-7', length: 82, segments: 1 },
        resolvedDriver: { encoding: 'GSM-7', length: 76, segments: 1 },
        escalatedCustomer: { encoding: 'GSM-7', length: 87, segments: 1 },
      },
      en: {
        incidentNotice: { encoding: 'GSM-7', length: 129, segments: 1 },
        callSoon: { encoding: 'GSM-7', length: 70, segments: 1 },
        callFallback: { encoding: 'GSM-7', length: 76, segments: 1 },
        mediationInvite: { encoding: 'GSM-7', length: 132, segments: 1 },
        invalidReply: { encoding: 'GSM-7', length: 25, segments: 1 },
        resolvedCustomer: { encoding: 'GSM-7', length: 85, segments: 1 },
        resolvedDriver: { encoding: 'GSM-7', length: 79, segments: 1 },
        escalatedCustomer: { encoding: 'GSM-7', length: 94, segments: 1 },
      },
    });
  });
});
