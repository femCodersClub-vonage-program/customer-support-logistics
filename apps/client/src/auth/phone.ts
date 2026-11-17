export const COUNTRIES = [
  { id: 'ES', dialCode: '34' },
  { id: 'GB', dialCode: '44' },
] as const;

export type CountryId = (typeof COUNTRIES)[number]['id'];

const E164 = /^\+[1-9]\d{7,14}$/;

export function toE164(countryId: CountryId, number: string): string | null {
  const compact = number.replace(/[\s().-]/g, '');

  if (compact.startsWith('+')) {
    return E164.test(compact) ? compact : null;
  }

  if (!/^\d+$/.test(compact)) {
    return null;
  }

  const country = COUNTRIES.find(({ id }) => id === countryId);
  const phone = `+${country?.dialCode ?? ''}${compact.replace(/^0/, '')}`;

  return E164.test(phone) ? phone : null;
}
