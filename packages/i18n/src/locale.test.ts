import { describe, expect, it } from 'vitest';

import { isLocale, negotiateLocale, parseAcceptLanguage } from './locale.js';

describe('isLocale', () => {
  it.each(['es', 'en'])('accepts the supported locale %s', (value) => {
    expect(isLocale(value)).toBe(true);
  });

  it.each(['fr', 'ES', 'es-ES', '', null, undefined, 1])('rejects %s', (value) => {
    expect(isLocale(value)).toBe(false);
  });
});

describe('negotiateLocale', () => {
  it('returns the first supported locale in order of preference', () => {
    expect(negotiateLocale(['fr', 'en', 'es'])).toBe('en');
  });

  it('matches a regional variant by its base language', () => {
    expect(negotiateLocale(['en-GB'])).toBe('en');
    expect(negotiateLocale(['es-MX'])).toBe('es');
  });

  it('ignores case and surrounding spaces', () => {
    expect(negotiateLocale([' EN-us '])).toBe('en');
  });

  it('falls back to Spanish when nothing matches', () => {
    expect(negotiateLocale(['fr-FR', 'de'])).toBe('es');
    expect(negotiateLocale([])).toBe('es');
  });
});

describe('parseAcceptLanguage', () => {
  it('orders the tags by quality', () => {
    expect(parseAcceptLanguage('en;q=0.5, es-ES, es;q=0.9')).toEqual(['es-ES', 'es', 'en']);
  });

  it('keeps the header order when qualities are equal', () => {
    expect(parseAcceptLanguage('en, es')).toEqual(['en', 'es']);
  });

  it('drops the wildcard, empty tags and tags with zero or invalid quality', () => {
    expect(parseAcceptLanguage('fr;q=0, *, , de;q=abc, en')).toEqual(['en']);
  });

  it.each([null, undefined, ''])('returns an empty list for %s', (header) => {
    expect(parseAcceptLanguage(header)).toEqual([]);
  });

  it('feeds negotiateLocale', () => {
    expect(negotiateLocale(parseAcceptLanguage('fr-FR, en-GB;q=0.8, es;q=0.7'))).toBe('en');
  });
});
