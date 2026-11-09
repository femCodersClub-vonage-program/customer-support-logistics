const VISIBLE_END = 3;

export function maskPhone(phone: string): string {
  const visibleStart = phone.startsWith('+') ? 3 : 2;

  if (phone.length <= visibleStart + VISIBLE_END) {
    return '*'.repeat(phone.length);
  }

  const hidden = phone.length - visibleStart - VISIBLE_END;

  return `${phone.slice(0, visibleStart)}${'*'.repeat(hidden)}${phone.slice(-VISIBLE_END)}`;
}
