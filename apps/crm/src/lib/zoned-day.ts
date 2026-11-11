import { TIME_ZONE } from '../i18n/locale';

const FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
});

function offsetAt(instant: number): number {
  const parts = FORMATTER.formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  const wallClock = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );

  return wallClock - Math.floor(instant / 1000) * 1000;
}

function toUtcIso(date: string, time: string): string {
  const wallClock = Date.parse(`${date}T${time}Z`);

  if (Number.isNaN(wallClock)) {
    return date;
  }

  const guess = wallClock - offsetAt(wallClock);

  return new Date(wallClock - offsetAt(guess)).toISOString();
}

export function startOfDay(date: string): string {
  return toUtcIso(date, '00:00:00.000');
}

export function endOfDay(date: string): string {
  return toUtcIso(date, '23:59:59.999');
}
