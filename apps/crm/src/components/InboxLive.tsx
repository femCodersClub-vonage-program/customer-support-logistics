'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { useEvents } from '../lib/events/EventsProvider';
import { INCIDENT_EVENT_TYPES } from '../lib/events/types';

import styles from './InboxLive.module.css';

const ANNOUNCE_DELAY_MS = 1500;
const REFRESH_DELAY_MS = 300;

const REFRESH_EVENTS = new Set<string>([
  INCIDENT_EVENT_TYPES.statusChanged,
  INCIDENT_EVENT_TYPES.assigned,
]);

export function InboxLive() {
  const t = useTranslations('inbox.live');
  const router = useRouter();
  const { subscribe } = useEvents();
  const [pending, setPending] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const knownIdsRef = useRef(new Set<string>());
  const burstRef = useRef(0);
  const announceTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const refreshSoon = () => {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(() => {
        router.refresh();
      }, REFRESH_DELAY_MS);
    };

    const unsubscribe = subscribe((message) => {
      if (message.kind === 'reconnected') {
        refreshSoon();
        return;
      }

      if (REFRESH_EVENTS.has(message.event.type)) {
        refreshSoon();
        return;
      }

      if (message.event.type !== INCIDENT_EVENT_TYPES.created) {
        return;
      }

      if (knownIdsRef.current.has(message.event.incidentId)) {
        return;
      }

      knownIdsRef.current.add(message.event.incidentId);
      burstRef.current += 1;
      setPending(knownIdsRef.current.size);

      clearTimeout(announceTimerRef.current);
      announceTimerRef.current = setTimeout(() => {
        setAnnouncement(t('announce', { count: burstRef.current }));
        burstRef.current = 0;
      }, ANNOUNCE_DELAY_MS);
    });

    return () => {
      unsubscribe();
      clearTimeout(announceTimerRef.current);
      clearTimeout(refreshTimerRef.current);
    };
  }, [subscribe, t, router]);

  const showNew = () => {
    knownIdsRef.current.clear();
    setPending(0);
    router.refresh();
  };

  return (
    <>
      {pending > 0 && (
        <button type="button" className={styles.banner} onClick={showNew}>
          {t('banner', { count: pending })}
        </button>
      )}
      <div aria-live="polite" className={styles.visuallyHidden}>
        {announcement}
      </div>
    </>
  );
}
