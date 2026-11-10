import { useFormatter } from 'next-intl';

export function RelativeTime({ value }: Readonly<{ value: string }>) {
  const format = useFormatter();
  const date = new Date(value);

  return (
    <time
      dateTime={value}
      title={format.dateTime(date, { dateStyle: 'medium', timeStyle: 'short' })}
    >
      {format.relativeTime(date, new Date())}
    </time>
  );
}