import { formatBytes } from "@outline-dash/core/format";
import type { KeyStatus, ServerSummary } from "@outline-dash/core/types";
import { ActivityIcon, ArrowUpRightIcon, KeyRoundIcon, ServerIcon, ServerOffIcon } from "lucide-react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { Link } from "react-router";
import { InstanceControl } from "~/components/instance-control";
import { STATUS_ORDER, StatusBadge, StatusDot, statusDotClass, statusLabel } from "~/components/status";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "~/components/ui/empty";
import { queryClient, serversQuery } from "~/lib/query";
import { cn } from "~/lib/utils";

// Canvas code only loads on this page.
const Constellation = lazy(() => import("~/components/constellation"));

const ATTENTION: KeyStatus[] = ["over-limit", "near-limit", "expired", "disabled"];

export function meta() {
  return [{ title: "Servers · Outline Admin" }];
}

export async function clientLoader() {
  await queryClient.ensureQueryData({ ...serversQuery(), revalidateIfStale: true });
}

export default function Overview() {
  const { data: servers } = useSuspenseQuery(serversQuery());
  const healthy = servers.filter((s) => s.ok);
  const down = servers.length - healthy.length;
  const keys = healthy.reduce((n, s) => n + s.keyCount, 0);
  const used = healthy.reduce((n, s) => n + s.usedBytes, 0);
  const needAttention = healthy.reduce((n, s) => n + ATTENTION.reduce((m, st) => m + s.statusCounts[st], 0), 0);

  if (servers.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ServerIcon />
          </EmptyMedia>
          <EmptyTitle>No servers configured</EmptyTitle>
          <EmptyDescription>
            Add servers to the <code>OUTLINE_SERVERS</code> secret of the API worker, or to <code>.dev.vars</code> locally.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-lg font-semibold tracking-tight">Servers</h1>
        <p className="text-xs text-muted-foreground">Live from each Outline server. Usage covers the last 30 days.</p>
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={ServerIcon} label="Servers" value={`${healthy.length}/${servers.length}`} hint={down ? `${down} unreachable` : "All reachable"} tone={down ? "bad" : undefined} />
        <Stat icon={KeyRoundIcon} label="Access keys" value={String(keys)} hint={needAttention ? `${needAttention} need attention` : "Nothing flagged"} tone={needAttention ? "warn" : undefined} />
        <Stat icon={ActivityIcon} label="Traffic" value={formatBytes(used)} hint="Last 30 days" />
        <Stat icon={ArrowUpRightIcon} label="Avg per key" value={keys ? formatBytes(used / keys) : "-"} hint="Last 30 days" />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Constellation</CardTitle>
          <CardDescription>
            Keys orbit their server. Dot size is traffic over the last 30 days; click a server to open it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Suspense fallback={<Skeleton className="h-80" />}>
            <Constellation servers={servers} />
          </Suspense>
          <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
            {STATUS_ORDER.map((s) => (
              <li key={s} className="flex items-center gap-1.5">
                <StatusDot className={statusDotClass(s)} />
                {statusLabel(s)}
              </li>
            ))}
            <li className="flex items-center gap-1.5">
              <span aria-hidden className="size-2 rounded-full border-2 border-destructive" />
              Server unreachable
            </li>
            <li className="flex items-center gap-1.5">
              <span aria-hidden className="size-2 rounded-full border-2 border-amber-500" />
              Instance rebooting
            </li>
          </ul>
        </CardContent>
      </Card>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {servers.map((s) => (s.ok ? <ServerCard key={s.id} summary={s} /> : <DownCard key={s.id} summary={s} />))}
      </section>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint: string;
  tone?: "bad" | "warn";
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription className="flex items-center gap-1.5">
          <Icon className="size-3.5" />
          {label}
        </CardDescription>
        <CardTitle className="text-xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p
          className={cn(
            "text-xs text-muted-foreground",
            tone === "bad" && "text-destructive",
            tone === "warn" && "text-amber-600 dark:text-amber-400",
          )}
        >
          {hint}
        </p>
      </CardContent>
    </Card>
  );
}

function ServerCard({ summary }: { summary: Extract<ServerSummary, { ok: true }> }) {
  const { server, statusCounts } = summary;
  const flagged = ATTENTION.filter((s) => statusCounts[s] > 0);
  return (
    // The title link is stretched over the card; the instance control sits above it.
    <Card className="relative h-full transition-colors has-[a:hover]:ring-primary/40 has-[a:focus-visible]:ring-ring">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <StatusDot className="size-2 bg-emerald-500" />
          <Link to={`/servers/${summary.id}`} className="truncate outline-none after:absolute after:inset-0">
            {server.name}
          </Link>
        </CardTitle>
        <CardDescription className="truncate font-mono">{server.hostnameForAccessKeys}</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-3 gap-3">
          <Metric label="Keys" value={String(summary.keyCount)} />
          <Metric label="Traffic" value={formatBytes(summary.usedBytes)} />
          <Metric label="Default limit" value={server.defaultLimitBytes == null ? "None" : formatBytes(server.defaultLimitBytes)} />
        </dl>
      </CardContent>
      <CardFooter className="flex flex-wrap items-center gap-1.5">
        {flagged.length > 0 ? (
          flagged.map((s) => <StatusBadge key={s} status={s} count={statusCounts[s]} />)
        ) : (
          <span className="text-xs text-muted-foreground">No keys need attention</span>
        )}
        <Badge variant="secondary" className="ml-auto font-mono">
          v{server.version}
        </Badge>
      </CardFooter>
      {summary.instance && (
        <CardFooter className="justify-between border-t">
          <span className="text-xs text-muted-foreground">Lightsail · {summary.instance.name}</span>
          <InstanceControl sid={summary.id} instance={summary.instance} serverName={server.name} />
        </CardFooter>
      )}
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function DownCard({ summary }: { summary: Extract<ServerSummary, { ok: false }> }) {
  return (
    <Card className="h-full ring-destructive/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <StatusDot className="size-2 bg-destructive" />
          {summary.label}
        </CardTitle>
        <CardDescription>Unreachable</CardDescription>
      </CardHeader>
      <CardContent className="flex gap-2 text-xs text-destructive">
        <ServerOffIcon className="mt-0.5 size-3.5 shrink-0" />
        <span>{summary.error}</span>
      </CardContent>
      {summary.instance && (
        <CardFooter className="flex-col items-start gap-2 border-t">
          <p className="text-xs text-muted-foreground">
            If the instance is hung, rebooting it usually brings Outline back.
          </p>
          <InstanceControl sid={summary.id} instance={summary.instance} serverName={summary.label} prominent />
        </CardFooter>
      )}
    </Card>
  );
}
