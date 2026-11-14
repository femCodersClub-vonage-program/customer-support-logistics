import { describe, expect, it } from 'vitest';

import { toTtsLanguage, toVerifyLocale } from './locales.js';

describe('Vonage locales', () => {
  it('maps each locale to a text-to-speech language', () => {
    expect(toTtsLanguage('es')).toBe('es-ES');
    expect(toTtsLanguage('en')).toBe('en-GB');
  });

  it('maps each locale to a Verify v2 locale', () => {
    expect(toVerifyLocale('es')).toBe('es-es');
    expect(toVerifyLocale('en')).toBe('en-gb');
  });
});
