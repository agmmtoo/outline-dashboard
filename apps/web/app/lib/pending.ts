import { useSyncExternalStore } from "react";

/** How long an action that can't be undone waits before its request is sent. */
export const GRACE_MS = 8_000;

export interface PendingAction {
  id: number;
  /** What will happen, e.g. `Deleting "Alice"`. */
  title: string;
  keyId?: string;
  startedAt: number;
  deadline: number;
}

type Entry = PendingAction & { run: () => void; timer: ReturnType<typeof setTimeout> };

let entries: Entry[] = [];
let snapshot: PendingAction[] = [];
let nextId = 1;
let focusedKeyId: string | null = null;
const listeners = new Set<() => void>();

function set(next: Entry[]) {
  entries = next;
  // A new array each time, so subscribers also re-render when the focused key changes.
  snapshot = next.map(({ run: _run, timer: _timer, ...rest }) => rest);
  for (const l of listeners) l();
}

function take(id: number) {
  const entry = entries.find((e) => e.id === id);
  if (!entry) return undefined;
  clearTimeout(entry.timer);
  set(entries.filter((e) => e.id !== id));
  return entry;
}

/**
 * Actions that can't be undone (delete, rotate, move, reset link) wait here for
 * GRACE_MS before their request is sent, so a slip can still be cancelled. Lives
 * only in memory: closing the tab cancels everything still waiting.
 */
export const pendingActions = {
  schedule(action: { title: string; keyId?: string; run: () => void }, ms = GRACE_MS) {
    const id = nextId++;
    const startedAt = Date.now();
    const timer = setTimeout(() => take(id)?.run(), ms);
    set([...entries, { ...action, id, startedAt, deadline: startedAt + ms, timer }]);
    return id;
  },
  cancel(id: number) {
    return take(id) != null;
  },
  runNow(id: number) {
    take(id)?.run();
  },
  /** The key whose panel is open; its actions show there instead of in the bottom bar. */
  focus(keyId: string | null) {
    focusedKeyId = keyId;
    set(entries);
  },
  get focusedKeyId() {
    return focusedKeyId;
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function usePendingActions() {
  return useSyncExternalStore(
    pendingActions.subscribe,
    () => snapshot,
    () => snapshot,
  );
}

if (typeof window !== "undefined") {
  // Ask before leaving while something is waiting; leaving cancels it.
  window.addEventListener("beforeunload", (e) => {
    if (entries.length > 0) e.preventDefault();
  });
}
