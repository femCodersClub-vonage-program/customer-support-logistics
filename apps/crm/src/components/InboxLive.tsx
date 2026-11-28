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
  const refreshingIdsRef = useRef(new Set<string>());
  const burstRef = useRef(0);
  const announceTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const refreshInbox = useCallback(() => {
    clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = undefined;
    knownIdsRef.current.forEach((id) => refreshingIdsRef.current.add(id));
    highlightIdsRef.current.forEach((id) => refreshingIdsRef.current.add(id));
    knownIdsRef.current.clear();
    highlightIdsRef.current.clear();
    setPending(0);
    startRefresh(() => router.refresh());
  }, [router, startRefresh]);

  useEffect(() => {
    if (isRefreshing || refreshingIdsRef.current.size === 0) {
      return;
    }

    highlight([...refreshingIdsRef.current]);
    refreshingIdsRef.current.clear();
  }, [isRefreshing]);

  useEffect(() => {
    const refreshSoon = () => {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(refreshInbox, REFRESH_DELAY_MS);
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
  }, [subscribe, t, refreshInbox]);

  const showNew = () => {
    clearTimeout(announceTimerRef.current);
    announceTimerRef.current = undefined;
    burstRef.current = 0;
    setAnnouncement('');
    refreshInbox();
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
