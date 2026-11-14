const E164_DIGITS = /^[1-9]\d{1,14}$/;

export function toE164(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }

  const digits = value.startsWith('+') ? value.slice(1) : value;

  return E164_DIGITS.test(digits) ? `+${digits}` : null;
}
