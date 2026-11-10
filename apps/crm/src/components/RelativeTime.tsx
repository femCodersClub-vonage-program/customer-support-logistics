import { useFormatter, useNow } from 'next-intl';

const EXACT_DATE_FORMAT = { dateStyle: 'medium', timeStyle: 'short' } as const;

export function RelativeTime({ value }: Readonly<{ value: string }>) {
  const format = useFormatter();
  const now = useNow();
  const date = new Date(value);

  return (
    <time dateTime={value} title={format.dateTime(date, EXACT_DATE_FORMAT)}>
      {format.relativeTime(date, now)}
    </time>
  );
}
