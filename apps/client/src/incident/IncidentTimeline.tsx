import { useFormatter, useTranslations } from 'use-intl';

import { customerEvents } from './customer-events.ts';
import { DATE_TIME_FORMAT } from './date-format.ts';

import type { CustomerEvent } from './customer-events.ts';
import type { IncidentEvent } from '@csl/shared-types';

function useEventText() {
  const t = useTranslations('incident.events');

  return (event: CustomerEvent) =>
    event.kind === 'status_changed' ? t(`status.${event.toStatus}`) : t(event.kind);
}

export function IncidentTimeline({ events }: { events: readonly IncidentEvent[] }) {
  const t = useTranslations('incident');
  const format = useFormatter();
  const eventText = useEventText();
  const items = customerEvents(events);

  if (items.length === 0) {
    return null;
  }

  return (
    <section className="incident-section" aria-labelledby="incident-timeline-title">
      <h2 id="incident-timeline-title" className="incident-section__title">
        {t('timeline')}
      </h2>
      <ol className="incident-timeline">
        {items.map((event) => (
          <li key={event.id} className="incident-timeline__item">
            <p className="incident-timeline__text">{eventText(event)}</p>
            <time className="incident-timeline__date" dateTime={event.occurredAt}>
              {format.dateTime(new Date(event.occurredAt), DATE_TIME_FORMAT)}
            </time>
          </li>
        ))}
      </ol>
    </section>
  );
}
