import { describe, expect, it } from 'vitest';

import { resolveLocale } from './locale';

describe('resolveLocale', () => {
  it('uses the cookie when it holds a supported locale', () => {
    expect(resolveLocale('en', 'es-ES,es;q=0.9')).toBe('en');
  });

  it('uses Accept-Language when there is no cookie', () => {
    expect(resolveLocale(undefined, 'fr-FR, en-GB;q=0.8')).toBe('en');
  });

  it('ignores an unsupported cookie value', () => {
    expect(resolveLocale('fr', 'en-US')).toBe('en');
  });

  it('falls back to Spanish', () => {
    expect(resolveLocale(undefined, null)).toBe('es');
    expect(resolveLocale(undefined, 'de-DE')).toBe('es');
  });
});
