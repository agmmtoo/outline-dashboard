import { useEffect, useState } from "react";
import { pendingActions, usePendingActions, type PendingAction } from "~/lib/pending";
import { cn } from "~/lib/utils";
import { Button } from "./ui/button";

/** Ticks while anything is waiting, so countdowns re-render. */
function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

export function PendingRow({ action, now, className }: { action: PendingAction; now: number; className?: string }) {
  const left = Math.max(0, action.deadline - now);
  const total = action.deadline - action.startedAt;
  return (
    <div className={cn("relative overflow-hidden border border-destructive/40 bg-popover text-popover-foreground", className)}>
      <div className="flex items-center gap-3 px-3 py-2">
        <p className="min-w-0 flex-1 truncate text-xs">
          <span className="font-medium">{action.title}</span>
          <span className="text-muted-foreground"> in {Math.ceil(left / 1000)}s</span>
        </p>
        <Button size="xs" variant="ghost" onClick={() => pendingActions.runNow(action.id)}>
          Do it now
        </Button>
        <Button size="xs" variant="outline" onClick={() => pendingActions.cancel(action.id)}>
          Cancel
        </Button>
      </div>
      <div
        aria-hidden
        className="absolute bottom-0 left-0 h-0.5 bg-destructive transition-[width] duration-200 ease-linear"
        style={{ width: `${(left / total) * 100}%` }}
      />
    </div>
  );
}

/** Stack of actions waiting to be sent, pinned to the bottom of the screen. */
export function PendingBar() {
  const actions = usePendingActions().filter((a) => a.keyId == null || a.keyId !== pendingActions.focusedKeyId);
  const now = useNow(actions.length > 0);
  if (actions.length === 0) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[60] mx-auto flex w-[min(30rem,calc(100%-2rem))] flex-col gap-2"
    >
      {actions.map((a) => (
        <PendingRow key={a.id} action={a} now={now} className="shadow-lg" />
      ))}
    </div>
  );
}

/** Waiting actions for one key, for showing inside the key panel. */
export function usePendingFor(keyId: string | undefined) {
  const actions = usePendingActions();
  useEffect(() => {
    if (!keyId) return;
    pendingActions.focus(keyId);
    return () => pendingActions.focus(null);
  }, [keyId]);
  const mine = actions.filter((a) => a.keyId === keyId);
  return { mine, now: useNow(mine.length > 0) };
}
