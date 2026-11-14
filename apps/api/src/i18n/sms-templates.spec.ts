import { INCIDENT_TYPES, SUPPORTED_LOCALES } from '@csl/shared-types';
import { describe, expect, it } from 'vitest';

import { measureSms } from '../vonage/sms-segments.js';

import {
  callFallbackSms,
  callSoonSms,
  incidentNoticeSms,
  invalidReplySms,
} from './sms-templates.js';

import type { Locale } from '@csl/shared-types';

const orderId = 'A1B2C3D4';

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
    invalidReply: invalidReplySms(locale),
  };
}

describe('SMS templates', () => {
  it('builds the incident notice with the translated incident type', () => {
    expect(incidentNoticeSms('es', { orderId, incidentType: 'damaged' })).toBe(
      'CSL: incidencia en el pedido A1B2C3D4 (Dañado). Responde 1 entregado, 2 no encuentro el domicilio, 3 cliente ausente.',
    );
    expect(incidentNoticeSms('en', { orderId, incidentType: 'damaged' })).toBe(
      "CSL: incident on order A1B2C3D4 (Damaged). Reply 1 delivered, 2 can't find the address, 3 customer not home.",
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

  it('keeps the driver replies numeric in every locale', () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(invalidReplySms(locale)).toMatch(/1, 2 (o|or) 3/);
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
          invalidReply: measureSms(invalidReplySms(locale)),
        },
      ]),
    );

    expect(measured).toEqual({
      es: {
        incidentNotice: { encoding: 'GSM-7', length: 130, segments: 1 },
        callSoon: { encoding: 'GSM-7', length: 70, segments: 1 },
        callFallback: { encoding: 'GSM-7', length: 80, segments: 1 },
        invalidReply: { encoding: 'GSM-7', length: 23, segments: 1 },
      },
      en: {
        incidentNotice: { encoding: 'GSM-7', length: 111, segments: 1 },
        callSoon: { encoding: 'GSM-7', length: 70, segments: 1 },
        callFallback: { encoding: 'GSM-7', length: 76, segments: 1 },
        invalidReply: { encoding: 'GSM-7', length: 28, segments: 1 },
      },
    });
  });
});
