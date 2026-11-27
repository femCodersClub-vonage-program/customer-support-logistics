'use client';

import { INCIDENT_STREAM_EVENT_TYPES } from '@csl/shared-types';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';

import { useEvents } from '../lib/events/EventsProvider';
import { highlight } from '../lib/events/highlights';

import styles from './InboxLive.module.css';

const ANNOUNCE_DELAY_MS = 1500;
const REFRESH_DELAY_MS = 300;

const REFRESH_EVENTS = new Set<string>([
  INCIDENT_STREAM_EVENT_TYPES[1],
  INCIDENT_STREAM_EVENT_TYPES[2],
]);

export function InboxLive() {
  const t = useTranslations('inbox.live');
  const router = useRouter();
  const { subscribe } = useEvents();
  const [pending, setPending] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const [isRefreshing, startRefresh] = useTransition();
  const knownIdsRef = useRef(new Set<string>());
  const highlightIdsRef = useRef(new Set<string>());
  const burstRef = useRef(0);
  const announceTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const clearPending = useCallback(() => {
    clearTimeout(announceTimerRef.current);
    announceTimerRef.current = undefined;
    burstRef.current = 0;
    knownIdsRef.current.clear();
    setPending(0);
    setAnnouncement('');
  }, []);

  useEffect(() => {
    if (isRefreshing || highlightIdsRef.current.size === 0) {
      return;
    }

    highlight([...highlightIdsRef.current]);
    highlightIdsRef.current.clear();
  }, [isRefreshing]);

  useEffect(() => {
    const refreshSoon = () => {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(() => {
        clearPending();
        startRefresh(() => router.refresh());
      }, REFRESH_DELAY_MS);
    };

    const unsubscribe = subscribe((message) => {
      if (message.kind === 'reconnected') {
        refreshSoon();
        return;
      }

      if (REFRESH_EVENTS.has(message.event.type)) {
        highlightIdsRef.current.add(message.event.incidentId);
        refreshSoon();
        return;
      }

      if (message.event.type !== INCIDENT_STREAM_EVENT_TYPES[0]) {
        return;
      }

      if (knownIdsRef.current.has(message.event.incidentId)) {
        return;
      }

      knownIdsRef.current.add(message.event.incidentId);
      burstRef.current += 1;
      setPending(knownIdsRef.current.size);
      setAnnouncement('');

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
  }, [subscribe, t, router, clearPending, startRefresh]);

  const showNew = () => {
    knownIdsRef.current.forEach((id) => highlightIdsRef.current.add(id));
    clearPending();
    startRefresh(() => router.refresh());
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
