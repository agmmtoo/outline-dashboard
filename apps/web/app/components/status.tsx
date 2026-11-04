import { formatBytes } from "@outline-dash/core/format";
import type { KeyStatus } from "@outline-dash/core/types";
import { useEffect, useRef, useState } from "react";
import { PolarAngleAxis, RadialBar, RadialBarChart } from "recharts";
import { MAGNITUDE, usageColor } from "~/lib/chart-colors";
import { cn } from "~/lib/utils";
import { Badge } from "./ui/badge";
import { ChartContainer, type ChartConfig } from "./ui/chart";

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

const ringConfig = { usage: { label: "Used", theme: MAGNITUDE } } satisfies ChartConfig;

/**
 * Usage against the key's limit as a ring (Recharts radial bar) that fills on mount.
 * Turns amber at 80% and red at 100%; a key without a limit shows an empty ring and
 * "No limit".
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

  const lg = size === "lg";
  const box = lg ? 56 : 32;
  const stroke = lg ? 5 : 3.5;
  const label = limit == null ? `${formatBytes(used)} used, no limit` : `${formatBytes(used)} of ${formatBytes(limit)} used (${pct}%)`;

  return (
    <div className={cn("flex min-w-28 items-center gap-2.5 sm:min-w-36", className)} role="img" aria-label={label}>
      <div className="relative shrink-0" style={{ width: box, height: box }}>
        <ChartContainer
          config={ringConfig}
          className="aspect-square size-full"
          initialDimension={{ width: box, height: box }}
          aria-hidden
        >
          <RadialBarChart
            data={[{ value: Math.min(100, ratio * 100) }]}
            startAngle={90}
            endAngle={-270}
            innerRadius={box / 2 - stroke}
            outerRadius={box / 2}
            barSize={stroke}
            margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
          >
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} axisLine={false} />
            <RadialBar
              dataKey="value"
              background
              cornerRadius={stroke}
              fill={usageColor(ratio, limit)}
              animationDuration={900}
              isAnimationActive={!reducedMotion()}
            />
          </RadialBarChart>
        </ChartContainer>
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

export function reducedMotion() {
  return typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}
