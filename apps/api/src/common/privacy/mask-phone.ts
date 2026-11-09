const VISIBLE_DIGITS = 3;

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');

  if (digits.length <= VISIBLE_DIGITS) {
    return '*'.repeat(digits.length);
  }

  const prefix = phone.startsWith('+') ? '+' : '';

  return `${prefix}${'*'.repeat(digits.length - VISIBLE_DIGITS)}${digits.slice(-VISIBLE_DIGITS)}`;
}
