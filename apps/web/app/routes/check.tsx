import { formatBytes } from "@outline-dash/core/format";
import type { KeyCheckView, KeyStatus } from "@outline-dash/core/types";
import { useMutation } from "@tanstack/react-query";
import { ArrowRightIcon, KeyRoundIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { StatusBadge } from "~/components/status";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { api, ApiError } from "~/lib/api";
import { cn } from "~/lib/utils";

export function meta() {
  return [{ title: "Check your key" }, { name: "robots", content: "noindex, nofollow" }];
}

const STATUS_NOTE: Record<KeyStatus, string> = {
  active: "Your key is working.",
  "near-limit": "You've used most of your data. Ask your admin for a top-up if you need more.",
  "over-limit": "You've reached your data limit, so the key won't connect until your admin tops it up.",
  idle: "Your key works, but it hasn't been used recently.",
  expired: "This key has expired. Contact your admin to renew it.",
  disabled: "This key is turned off. Contact your admin.",
};

const DAY = 86_400_000;

/** "k7q2m9xa3f" typed in any shape -> "K7Q2-M9XA-3F" as you type; ss:// links pass through. */
function formatInput(raw: string) {
  if (/^ss:/i.test(raw.trim())) return raw.trim();
  const c = raw.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 10);
  return [c.slice(0, 4), c.slice(4, 8), c.slice(8)].filter(Boolean).join("-");
}

/**
 * Public page for key holders: enter the lookup code shown next to the key's name
 * in the Outline app (or paste the ss:// link) to see that key's usage and limit.
 * The code is only sent in the request body, never put in the URL.
 */
export default function Check() {
  const [value, setValue] = useState("");
  const check = useMutation({
    mutationFn: (code: string) => api<KeyCheckView>("/public/check", { method: "POST", body: { code } }),
  });
  const key = check.data;

  return (
    <div className="relative mx-auto max-w-3xl space-y-6 py-6 sm:py-12">
      <Backdrop />

      <div className="space-y-2 text-center">
        <p className="text-[11px] font-medium tracking-[0.2em] text-primary uppercase dark:text-teal-400">Outline key</p>
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
          How much data do I have left?
        </h1>
        <p className="text-sm text-muted-foreground">Enter the code from your Outline app to see your usage.</p>
      </div>

      <form
        className="mx-auto flex max-w-xl gap-2 bg-card/60 p-2 ring-1 ring-foreground/10 backdrop-blur-xl"
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) check.mutate(value.trim());
        }}
      >
        <label htmlFor="code" className="sr-only">
          Your code
        </label>
        <input
          id="code"
          value={value}
          onChange={(e) => setValue(formatInput(e.target.value))}
          placeholder="XXXX-XXXX-XX"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          required
          className="h-11 min-w-0 flex-1 bg-transparent px-3 font-mono text-base tracking-[0.2em] outline-none placeholder:text-muted-foreground/50"
        />
        <Button type="submit" size="lg" className="h-11 px-5" disabled={check.isPending}>
          {check.isPending ? "Checking…" : "Check"}
          <ArrowRightIcon />
        </Button>
      </form>

      {check.isError && (
        <Alert variant="destructive" className="mx-auto max-w-xl bg-card/70 backdrop-blur">
          <AlertDescription>
            {check.error instanceof ApiError ? check.error.message : "Couldn't check right now. Try again in a moment."}
          </AlertDescription>
        </Alert>
      )}

      {key ? <Result key={`${key.label}-${key.usedBytes}`} k={key} /> : <WhereToFind />}
    </div>
  );
}

/** Shows what the code looks like in the Outline app before the first lookup. */
function WhereToFind() {
  return (
    <div className="mx-auto max-w-xl space-y-3 text-center">
      <p className="text-xs text-muted-foreground">Your code is in brackets after your key's name in the Outline app:</p>
      <div aria-hidden className="mx-auto flex max-w-sm items-center gap-3 bg-card/60 p-3 text-left ring-1 ring-foreground/10 backdrop-blur">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary dark:text-teal-400">
          <KeyRoundIcon className="size-4" />
        </span>
        <div className="min-w-0 text-sm">
          <div className="truncate font-medium">
            Your name{" "}
            <span className="bg-primary/15 px-1 font-mono text-primary dark:text-teal-400">(K7Q2-M9XA-3F)</span>
          </div>
          <div className="text-xs text-muted-foreground">Connected</div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">No code? Paste your full ss:// link instead, or ask your admin.</p>
    </div>
  );
}

function Result({ k }: { k: KeyCheckView }) {
  const left = k.limitBytes == null ? null : Math.max(0, k.limitBytes - k.usedBytes);
  const daysLeft = k.expires ? Math.ceil((Date.parse(`${k.expires}T23:59:59Z`) - Date.now()) / DAY) : null;
  return (
    <section
      aria-label="Your key"
      className="grid items-center gap-6 bg-card/70 p-6 ring-1 ring-foreground/10 backdrop-blur-xl sm:grid-cols-[auto_1fr] sm:p-8"
    >
      <Gauge used={k.usedBytes} limit={k.limitBytes} off={k.status === "disabled" || k.status === "expired"} />
      <div className="min-w-0 space-y-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-base font-semibold">{k.label}</h2>
            <StatusBadge status={k.status} />
          </div>
          <p className="text-sm text-muted-foreground">{STATUS_NOTE[k.status]}</p>
        </div>
        <dl className="grid grid-cols-3 gap-3 border-t pt-4">
          <Item label="Used" value={formatBytes(k.usedBytes)} />
          <Item label="Limit" value={k.limitBytes == null ? "No limit" : formatBytes(k.limitBytes)} />
          <Item
            label="Expires"
            value={k.expires ?? "Never"}
            hint={daysLeft == null ? undefined : daysLeft < 0 ? "Expired" : daysLeft === 0 ? "Today" : `In ${daysLeft} days`}
          />
        </dl>
        <p className="text-xs text-muted-foreground">
          {left == null
            ? "Usage counts the last 30 days."
            : "Usage counts the last 30 days, so data used a month ago frees up day by day."}
        </p>
      </div>
    </section>
  );
}

const SIZE = 220;
const R = 92;
const C = 2 * Math.PI * R;
const SWEEP = 0.75; // a 270° arc, open at the bottom

/** Big 270° gauge of data left. Fills on mount; holds still with reduced motion. */
function Gauge({ used, limit, off }: { used: number; limit: number | null; off: boolean }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    // A timer rather than animation frames, so it also fills in background tabs.
    const id = setTimeout(() => setShown(true), 50);
    return () => clearTimeout(id);
  }, []);

  const ratio = limit ? Math.min(1, used / Math.max(limit, 1)) : 0;
  const tone = off
    ? "stroke-muted-foreground"
    : limit == null
      ? "stroke-primary dark:stroke-teal-400"
      : ratio >= 1
        ? "stroke-destructive"
        : ratio >= 0.8
          ? "stroke-amber-500"
          : "stroke-primary dark:stroke-teal-400";
  const arc = SWEEP * C;
  // The arc shows what's used; with no limit it's a calm full ring.
  const filled = limit == null ? arc : arc * ratio;
  const left = limit == null ? null : Math.max(0, limit - used);

  return (
    <div className="relative mx-auto" style={{ width: SIZE, height: SIZE }}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="size-full rotate-[135deg]" aria-hidden>
        {/* Ticks every 10% */}
        {Array.from({ length: 11 }, (_, i) => {
          const a = (i / 10) * SWEEP * 2 * Math.PI;
          const r1 = R + 12;
          const r2 = R + (i % 5 === 0 ? 18 : 15);
          return (
            <line
              key={i}
              x1={SIZE / 2 + r1 * Math.cos(a)}
              y1={SIZE / 2 + r1 * Math.sin(a)}
              x2={SIZE / 2 + r2 * Math.cos(a)}
              y2={SIZE / 2 + r2 * Math.sin(a)}
              className="stroke-muted-foreground/40"
              strokeWidth={1.5}
              strokeLinecap="round"
            />
          );
        })}
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          strokeWidth={14}
          strokeLinecap="round"
          strokeDasharray={`${arc} ${C}`}
          className="stroke-muted"
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          strokeWidth={14}
          strokeLinecap="round"
          strokeDasharray={`${shown ? filled : 0} ${C}`}
          className={cn(
            tone,
            limit == null && "opacity-40",
            "transition-[stroke-dasharray] duration-1000 ease-[cubic-bezier(.2,.7,.2,1)] motion-reduce:transition-none",
          )}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-[11px] tracking-wide text-muted-foreground uppercase">{left == null ? "Data" : "Left"}</span>
        <span className="text-3xl font-semibold tracking-tight tabular-nums">{left == null ? "∞" : formatBytes(left)}</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {limit == null ? "No limit" : `${Math.round(ratio * 100)}% used`}
        </span>
      </div>
    </div>
  );
}

function Item({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="truncate text-sm font-medium tabular-nums">{value}</dd>
      {hint && <dd className="text-xs text-muted-foreground">{hint}</dd>}
    </div>
  );
}

/** Full-page backdrop: drifting glows over a faint grid that fades out toward the edges. */
function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div
        className="absolute inset-0 opacity-60 [mask-image:radial-gradient(ellipse_70%_60%_at_50%_30%,black,transparent)]"
        style={{
          backgroundImage:
            "linear-gradient(to right, color-mix(in oklab, var(--foreground) 7%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklab, var(--foreground) 7%, transparent) 1px, transparent 1px)",
          backgroundSize: "36px 36px",
        }}
      />
      <div className="absolute -top-32 left-1/2 size-[36rem] -translate-x-2/3 rounded-full bg-teal-500/20 blur-3xl motion-safe:animate-[drift_18s_ease-in-out_infinite_alternate] dark:bg-teal-400/15" />
      <div className="absolute top-40 left-1/2 size-[28rem] rounded-full bg-emerald-400/15 blur-3xl motion-safe:animate-[drift_24s_ease-in-out_infinite_alternate-reverse] dark:bg-emerald-500/10" />
      <div className="absolute -bottom-40 left-0 size-[30rem] rounded-full bg-sky-500/10 blur-3xl motion-safe:animate-[drift_30s_ease-in-out_infinite_alternate]" />
    </div>
  );
}
