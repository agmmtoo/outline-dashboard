import { formatBytes } from "@outline-dash/core/format";
import type { KeyStatus } from "@outline-dash/core/types";
import { cn } from "~/lib/utils";
import { Badge } from "./ui/badge";
import { Progress } from "./ui/progress";

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

export function UsageBar({ used, limit, className }: { used: number; limit: number | null; className?: string }) {
  const ratio = limit ? used / Math.max(limit, 1) : 0;
  const tone = !limit
    ? "[&_[data-slot=progress-indicator]]:bg-muted-foreground/40"
    : ratio >= 1
      ? "[&_[data-slot=progress-indicator]]:bg-destructive"
      : ratio >= 0.8
        ? "[&_[data-slot=progress-indicator]]:bg-amber-500"
        : "";
  return (
    <div className={cn("min-w-28 space-y-1.5 sm:min-w-36", className)}>
      <div className="flex items-baseline justify-between gap-2 text-xs tabular-nums">
        <span className="font-medium">{formatBytes(used)}</span>
        <span className="text-muted-foreground">{limit == null ? "No limit" : `of ${formatBytes(limit)}`}</span>
      </div>
      <Progress value={limit ? Math.min(100, ratio * 100) : 0} className={tone} aria-label="Data usage" />
    </div>
  );
}
