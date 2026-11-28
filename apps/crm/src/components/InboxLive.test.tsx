import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useEvents } from '../lib/events/EventsProvider';
import { isHighlighted, resetHighlights } from '../lib/events/highlights';
import { renderWithIntl } from '../test/render';

import { InboxLive } from './InboxLive';

import type { StreamMessage } from '../lib/events/EventsProvider';

const { refresh, router } = vi.hoisted(() => {
  const refresh = vi.fn();

  return {
    refresh,
    router: { refresh },
  };
});

vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('../lib/events/EventsProvider', () => ({ useEvents: vi.fn() }));

let emit: (message: StreamMessage) => void = () => {};

function created(incidentId: string): StreamMessage {
  return {
    kind: 'event',
    event: { type: 'incident.created', incidentId, updatedAt: '2026-11-21T10:00:00Z' },
  };
}

beforeEach(() => {
  refresh.mockReset();
  resetHighlights();

  vi.mocked(useEvents).mockReturnValue({
    state: 'connected',
    subscribe: (listener) => {
      emit = listener;

      return () => {};
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('InboxLive', () => {
  it('shows nothing until an incident is created', () => {
    renderWithIntl(<InboxLive />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('counts new incidents in a banner without refreshing the list', () => {
    renderWithIntl(<InboxLive />);

    act(() => {
      emit(created('a'));
      emit(created('b'));
    });

    expect(
      screen.getByRole('button', { name: 'Refresh inbox (2 new incidents)' }),
    ).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('does not count the same incident twice', () => {
    renderWithIntl(<InboxLive />);

    act(() => {
      emit(created('a'));
      emit(created('a'));
    });

    expect(
      screen.getByRole('button', { name: 'Refresh inbox (1 new incident)' }),
    ).toBeInTheDocument();
  });

  it('ignores other events', () => {
    renderWithIntl(<InboxLive />);

    act(() => {
      emit({
        kind: 'event',
        event: {
          type: 'incident.evidence_added',
          incidentId: 'a',
          updatedAt: '2026-11-21T10:00:00Z',
        },
      });
    });

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('refreshes the list and hides the banner when it is clicked', () => {
    renderWithIntl(<InboxLive />);
    act(() => emit(created('a')));

    fireEvent.click(screen.getByRole('button'));

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(isHighlighted('a')).toBe(true);
  });

  it('announces a burst of incidents once', () => {
    vi.useFakeTimers();
    renderWithIntl(<InboxLive />);

    act(() => {
      emit(created('a'));
      emit(created('b'));
      emit(created('c'));
    });
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    const live = document.querySelector('[aria-live="polite"]');

    expect(live).toHaveTextContent('3 new incidents received');
  });

  it('announces a new burst even when its message is identical to the previous one', () => {
    vi.useFakeTimers();
    renderWithIntl(<InboxLive />);

    act(() => emit(created('a')));
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    const live = document.querySelector('[aria-live="polite"]');

    expect(live).toHaveTextContent('1 new incident received');

    act(() => emit(created('b')));

    expect(live).toBeEmptyDOMElement();

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(live).toHaveTextContent('1 new incident received');
  });

  it('refreshes once after a burst of status changes', () => {
    vi.useFakeTimers();
    renderWithIntl(<InboxLive />);

    const changed = (incidentId: string): StreamMessage => ({
      kind: 'event',
      event: {
        type: 'incident.status_changed',
        incidentId,
        status: 'notified',
        updatedAt: '2026-11-21T10:00:00Z',
      },
    });

    act(() => {
      emit(changed('a'));
      emit(changed('b'));
      emit(changed('c'));
    });
    expect(refresh).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(isHighlighted('a')).toBe(true);
    expect(isHighlighted('b')).toBe(true);
    expect(isHighlighted('c')).toBe(true);
  });

  it('clears pending incidents when a status change refreshes the inbox', () => {
    vi.useFakeTimers();
    renderWithIntl(<InboxLive />);

    act(() => {
      emit(created('a'));
    });

    expect(
      screen.getByRole('button', { name: 'Refresh inbox (1 new incident)' }),
    ).toBeInTheDocument();

    act(() => {
      emit({
        kind: 'event',
        event: {
          type: 'incident.status_changed',
          incidentId: 'b',
          status: 'notified',
          updatedAt: '2026-11-21T10:00:00Z',
        },
      });
    });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    act(() => {
      emit(created('a'));
    });

    expect(
      screen.getByRole('button', { name: 'Refresh inbox (1 new incident)' }),
    ).toBeInTheDocument();
  });

  it('highlights pending incidents when a status change refreshes the inbox', () => {
    vi.useFakeTimers();
    renderWithIntl(<InboxLive />);

    act(() => {
      emit(created('a'));
      emit({
        kind: 'event',
        event: {
          type: 'incident.status_changed',
          incidentId: 'b',
          status: 'notified',
          updatedAt: '2026-11-21T10:00:00Z',
        },
      });
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(isHighlighted('a')).toBe(true);
    expect(isHighlighted('b')).toBe(true);
  });

  it('still announces new incidents when a status change refreshes the inbox', () => {
    vi.useFakeTimers();
    renderWithIntl(<InboxLive />);

    act(() => {
      emit(created('a'));
      emit({
        kind: 'event',
        event: {
          type: 'incident.status_changed',
          incidentId: 'b',
          status: 'notified',
          updatedAt: '2026-11-21T10:00:00Z',
        },
      });
    });
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[aria-live="polite"]')).toHaveTextContent(
      '1 new incident received',
    );
  });

  it('refreshes when an incident is assigned', () => {
    vi.useFakeTimers();
    renderWithIntl(<InboxLive />);

    act(() => {
      emit({
        kind: 'event',
        event: { type: 'incident.assigned', incidentId: 'a', updatedAt: '2026-11-21T10:00:00Z' },
      });
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(isHighlighted('a')).toBe(true);
  });

  it('refreshes after reconnecting', () => {
    vi.useFakeTimers();
    renderWithIntl(<InboxLive />);

    act(() => emit({ kind: 'reconnected' }));
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('highlights the incident whose status changed after refreshing', () => {
    vi.useFakeTimers();
    renderWithIntl(<InboxLive />);

    act(() => {
      emit({
        kind: 'event',
        event: {
          type: 'incident.status_changed',
          incidentId: 'a',
          status: 'notified',
          updatedAt: '2026-11-21T10:00:00Z',
        },
      });
    });

    expect(isHighlighted('a')).toBe(false);

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(isHighlighted('a')).toBe(true);
  });

  it('highlights the new incidents only when the banner is clicked', () => {
    renderWithIntl(<InboxLive />);
    act(() => emit(created('a')));

    expect(isHighlighted('a')).toBe(false);

    fireEvent.click(screen.getByRole('button'));

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(isHighlighted('a')).toBe(true);
  });
});
