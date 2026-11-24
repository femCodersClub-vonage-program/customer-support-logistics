'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { useEvents } from '../lib/events/EventsProvider';
import { INCIDENT_EVENT_TYPES } from '../lib/events/types';

import styles from './InboxLive.module.css';

const ANNOUNCE_DELAY_MS = 1500;

export function InboxLive() {
  const t = useTranslations('inbox.live');
  const router = useRouter();
  const { subscribe } = useEvents();
  const [pending, setPending] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const knownIdsRef = useRef(new Set<string>());
  const burstRef = useRef(0);
  const announceTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = subscribe((message) => {
      if (message.kind !== 'event' || message.event.type !== INCIDENT_EVENT_TYPES.created) {
        return;
      }

      // The same incident can arrive twice (for example after a reconnection).
      if (knownIdsRef.current.has(message.event.incidentId)) {
        return;
      }

      knownIdsRef.current.add(message.event.incidentId);
      burstRef.current += 1;
      setPending(knownIdsRef.current.size);

      // One announcement for a burst of incidents, instead of one per event.
      clearTimeout(announceTimerRef.current);
      announceTimerRef.current = setTimeout(() => {
        setAnnouncement(t('announce', { count: burstRef.current }));
        burstRef.current = 0;
      }, ANNOUNCE_DELAY_MS);
    });

    return () => {
      unsubscribe();
      clearTimeout(announceTimerRef.current);
    };
  }, [subscribe, t]);

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
