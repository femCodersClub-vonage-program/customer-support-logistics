const HIGHLIGHT_MS = 3000;

let highlighted: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function notify() {
  listeners.forEach((listener) => listener());
}

function remove(id: string) {
  const next = new Set(highlighted);

  next.delete(id);
  timers.delete(id);
  highlighted = next;
  notify();
}

export function highlight(ids: readonly string[]) {
  if (ids.length === 0) {
    return;
  }

  const next = new Set(highlighted);

  for (const id of ids) {
    next.add(id);
    clearTimeout(timers.get(id));
    timers.set(
      id,
      setTimeout(() => remove(id), HIGHLIGHT_MS),
    );
  }

  highlighted = next;
  notify();
}

export function isHighlighted(id: string): boolean {
  return highlighted.has(id);
}

export function subscribeHighlights(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

// For tests only.
export function resetHighlights() {
  timers.forEach((timer) => clearTimeout(timer));
  timers.clear();
  highlighted = new Set();
  notify();
}
