import { describe, expect, it } from 'vitest';

import { measureSms } from './sms-segments.js';

describe('measureSms', () => {
  it('uses GSM-7 for plain text', () => {
    expect(measureSms('Hola')).toEqual({ encoding: 'GSM-7', length: 4, segments: 1 });
  });

  it.each(['ñ', 'é', 'ü', '¿', '¡', 'Ñ'])('keeps GSM-7 for %s', (char) => {
    expect(measureSms(`a${char}`).encoding).toBe('GSM-7');
  });

  it.each(['á', 'í', 'ó', 'ú', '’', '“'])('switches to UCS-2 for %s', (char) => {
    expect(measureSms(`a${char}`)).toEqual({ encoding: 'UCS-2', length: 2, segments: 1 });
  });

  it('counts GSM-7 extended characters twice', () => {
    expect(measureSms('€{}')).toEqual({ encoding: 'GSM-7', length: 6, segments: 1 });
  });

  it('splits GSM-7 into 153-character segments after 160', () => {
    expect(measureSms('a'.repeat(160)).segments).toBe(1);
    expect(measureSms('a'.repeat(161)).segments).toBe(2);
    expect(measureSms('a'.repeat(306)).segments).toBe(2);
    expect(measureSms('a'.repeat(307)).segments).toBe(3);
  });

  it('splits UCS-2 into 67-character segments after 70', () => {
    expect(measureSms('á'.repeat(70)).segments).toBe(1);
    expect(measureSms('á'.repeat(71)).segments).toBe(2);
    expect(measureSms('á'.repeat(134)).segments).toBe(2);
    expect(measureSms('á'.repeat(135)).segments).toBe(3);
  });

  it('counts characters outside the BMP as two UCS-2 units', () => {
    expect(measureSms('👍')).toEqual({ encoding: 'UCS-2', length: 2, segments: 1 });
  });

  it('returns no segments for an empty text', () => {
    expect(measureSms('')).toEqual({ encoding: 'GSM-7', length: 0, segments: 0 });
  });
});
