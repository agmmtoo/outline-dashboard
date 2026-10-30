import { formatBytes } from "@outline-dash/core/format";
import type { KeyStatus } from "@outline-dash/core/types";
import { useEffect, useRef, useState } from "react";
import { cn } from "~/lib/utils";
import { Badge } from "./ui/badge";

const STATUS_META: Record<KeyStatus, { label: string; dot: string }> = {
  active: { label: "Active", dot: "bg-emerald-500" },
  "near-limit": { label: "Near limit", dot: "bg-amber-500" },
  "over-limit": { label: "Over limit", dot: "bg-red-500" },
  idle: { label: "Idle", dot: "bg-muted-foreground/50" },
  expired: { label: "Expired", dot: "bg-orange-500" },
  disabled: { label: "Disabled", dot: "bg-muted-foreground" },
};

export const STATUS_ORDER = Object.keys(STATUS_META) as KeyStatus[];

export function statusLabel(status: KeyStatus) {
  return STATUS_META[status].label;
}

export function statusDotClass(status: KeyStatus) {
  return STATUS_META[status].dot;
}

export function StatusDot({ className }: { className?: string }) {
  return <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", className)} />;
}

export function StatusBadge({ status, count }: { status: KeyStatus; count?: number }) {
  const meta = STATUS_META[status];
  return (
    <Badge variant="outline" className={cn(status === "disabled" && "text-muted-foreground")}>
      <StatusDot className={meta.dot} />
      {meta.label}
      {count != null && <span className="tabular-nums text-muted-foreground">{count}</span>}
    </Badge>
  );
}

/** Status colors for SVG fills, as literal classes so Tailwind picks them up. */
export const STATUS_FILL: Record<KeyStatus, string> = {
  active: "fill-emerald-500",
  "near-limit": "fill-amber-500",
  "over-limit": "fill-red-500",
  idle: "fill-muted-foreground/50",
  expired: "fill-orange-500",
  disabled: "fill-muted-foreground",
};

function usageTone(ratio: number, limit: number | null) {
  if (!limit) return "stroke-muted-foreground/40";
  if (ratio >= 1) return "stroke-destructive";
  if (ratio >= 0.8) return "stroke-amber-500";
  // Dark mode's primary is too deep to read against the track.
  return "stroke-primary dark:stroke-teal-400";
}

/** Counts up to `to` on mount, then from the last value when it changes (instant with reduced motion). */
function useCountUp(to: number, ms = 900) {
  const [value, setValue] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return setValue((from.current = to));
    let raf = 0;
    const start = performance.now();
    const base = from.current;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      setValue((from.current = Math.round(base + (to - base) * (1 - (1 - p) ** 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, ms]);
  return value;
}

/**
 * Usage against the key's limit as a ring that fills on mount. Turns amber at 80%
 * and red at 100%; a key without a limit shows an empty ring and "No limit".
 */
export function UsageRing({
  used,
  limit,
  size = "sm",
  className,
}: {
  used: number;
  limit: number | null;
  size?: "sm" | "lg";
  className?: string;
}) {
  const ratio = limit ? used / Math.max(limit, 1) : 0;
  const pct = limit ? Math.round(ratio * 100) : null;
  const shown = useCountUp(pct ?? 0);
  const [filled, setFilled] = useState(false);
  useEffect(() => {
    // Two frames so the empty ring paints first and the fill transitions in.
    let inner = 0;
    const outer = requestAnimationFrame(() => (inner = requestAnimationFrame(() => setFilled(true))));
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, []);

  const lg = size === "lg";
  const box = lg ? 56 : 32;
  const stroke = lg ? 5 : 3.5;
  const r = (box - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = filled ? c * (1 - Math.min(1, ratio)) : c;
  const label = limit == null ? `${formatBytes(used)} used, no limit` : `${formatBytes(used)} of ${formatBytes(limit)} used (${pct}%)`;

  return (
    <div className={cn("flex min-w-28 items-center gap-2.5 sm:min-w-36", className)} role="img" aria-label={label}>
      <div className="relative shrink-0" style={{ width: box, height: box }}>
        <svg viewBox={`0 0 ${box} ${box}`} className="-rotate-90" aria-hidden>
          <circle cx={box / 2} cy={box / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-muted" />
          <circle
            cx={box / 2}
            cy={box / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
            className={cn(
              "transition-[stroke-dashoffset] duration-900 ease-[cubic-bezier(.2,.7,.2,1)] motion-reduce:transition-none",
              usageTone(ratio, limit),
            )}
          />
        </svg>
        {lg && (
          <span className="absolute inset-0 grid place-items-center text-[11px] font-semibold tabular-nums">
            {pct == null ? "∞" : `${shown}%`}
          </span>
        )}
      </div>
      <div className="min-w-0 text-xs tabular-nums" aria-hidden>
        <div className="font-medium">{formatBytes(used)}</div>
        <div className="text-muted-foreground">
          {limit == null ? "No limit" : lg ? `of ${formatBytes(limit)}` : `${shown}% of ${formatBytes(limit)}`}
        </div>
      </div>
    </div>
  );
}
