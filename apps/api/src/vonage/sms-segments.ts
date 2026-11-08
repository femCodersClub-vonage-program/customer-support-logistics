const GSM7_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
  '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';

const GSM7_EXTENDED = '\f^{}\\[~]|€';

const GSM7_BASIC_SET = new Set(GSM7_BASIC);
const GSM7_EXTENDED_SET = new Set(GSM7_EXTENDED);

export type SmsEncoding = 'GSM-7' | 'UCS-2';

export interface SmsSegments {
  encoding: SmsEncoding;
  length: number;
  segments: number;
}

const LIMITS: Record<SmsEncoding, { single: number; multipart: number }> = {
  'GSM-7': { single: 160, multipart: 153 },
  'UCS-2': { single: 70, multipart: 67 },
};

function gsm7Length(text: string): number | null {
  let length = 0;

  for (const char of text) {
    if (GSM7_BASIC_SET.has(char)) {
      length += 1;
    } else if (GSM7_EXTENDED_SET.has(char)) {
      length += 2;
    } else {
      return null;
    }
  }

  return length;
}

export function measureSms(text: string): SmsSegments {
  const gsm7 = gsm7Length(text);
  const encoding: SmsEncoding = gsm7 === null ? 'UCS-2' : 'GSM-7';
  const length = gsm7 ?? text.length;
  const { single, multipart } = LIMITS[encoding];
  const segments = length === 0 ? 0 : length <= single ? 1 : Math.ceil(length / multipart);

  return { encoding, length, segments };
}
