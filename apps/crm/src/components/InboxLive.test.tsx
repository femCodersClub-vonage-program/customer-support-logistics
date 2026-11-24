import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useEvents } from '../lib/events/EventsProvider';
import { renderWithIntl } from '../test/render';

import { InboxLive } from './InboxLive';

import type { StreamMessage } from '../lib/events/types';

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
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

    expect(screen.getByRole('button', { name: 'Show 2 new incidents' })).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('does not count the same incident twice', () => {
    renderWithIntl(<InboxLive />);

    act(() => {
      emit(created('a'));
      emit(created('a'));
    });

    expect(screen.getByRole('button', { name: 'Show 1 new incident' })).toBeInTheDocument();
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

    expect(live).toHaveTextContent('3 new incidents');
  });
});
