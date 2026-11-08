import { describe, expect, it } from 'vitest';

import { getTranslator } from './translator.js';

describe('getTranslator', () => {
  it('translates shared enum labels in each locale', () => {
    expect(getTranslator('es')('incidentType.damaged')).toBe('Dañado');
    expect(getTranslator('en')('incidentType.damaged')).toBe('Damaged');
  });

  it('reuses the translator of a locale', () => {
    expect(getTranslator('es')).toBe(getTranslator('es'));
  });

  it('throws instead of returning a fallback for a missing key', () => {
    const translate = getTranslator('es') as unknown as (key: string) => string;

    expect(() => translate('sms.missing')).toThrow();
  });
});
