import { useEffect, useState } from 'react';

export function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, '0');

  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

export function toIsoDuration(totalSeconds: number): string {
  return `PT${totalSeconds}S`;
}

export function useCallDuration(connectedAt: number | null): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (connectedAt === null) {
      return;
    }

    const timer = setInterval(() => setNow(Date.now()), 1000);

    return () => clearInterval(timer);
  }, [connectedAt]);

  return connectedAt === null ? 0 : Math.max(0, Math.floor((now - connectedAt) / 1000));
}
