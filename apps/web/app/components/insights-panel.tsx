import { formatBytes, formatDuration, formatRelative } from "@outline-dash/core/format";
import type { KeyView, ServerInsights } from "@outline-dash/core/types";
import { FlaskConicalIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Progress } from "./ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";

export function InsightsPanel({ keys, insights }: { keys: KeyView[]; insights: ServerInsights }) {
  const top = keys
    .filter((k) => k.usedBytes > 0)
    .sort((a, b) => b.usedBytes - a.usedBytes)
    .slice(0, 10);
  const maxUsed = top[0]?.usedBytes || 1;
  const totalLocationBytes = insights.locations.reduce((n, l) => n + l.bytes, 0) || 1;

  return (
    <div className="space-y-4">
      {insights.available ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Tunnel time" value={formatDuration(insights.tunnelSeconds)} hint="Last 30 days" />
          <Stat label="Current bandwidth" value={rate(insights.bandwidthCurrentBytes)} hint="Right now" />
          <Stat label="Peak bandwidth" value={rate(insights.bandwidthPeakBytes)} hint="Last 30 days" />
          <Stat
            label="Peak at"
            value={insights.bandwidthPeakAtMs ? formatRelative(insights.bandwidthPeakAtMs) : "-"}
            hint={insights.bandwidthPeakAtMs ? new Date(insights.bandwidthPeakAtMs).toLocaleString() : "Unknown"}
          />
        </div>
      ) : (
        <Alert>
          <FlaskConicalIcon />
          <AlertTitle>Experimental metrics unavailable</AlertTitle>
          <AlertDescription>
            This Outline version does not expose bandwidth, locations or last-seen data. Per-key usage still works.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top consumers</CardTitle>
            <CardDescription>Keys with the most traffic in the last 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            {top.length === 0 ? (
              <p className="text-muted-foreground">No traffic in the last 30 days.</p>
            ) : (
              <ol className="space-y-3">
                {top.map((k, i) => (
                  <li key={k.id} className="space-y-1.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate">
                        <span className="mr-2 font-mono text-muted-foreground">{i + 1}</span>
                        {k.label}
                      </span>
                      <span className="tabular-nums text-muted-foreground">{formatBytes(k.usedBytes)}</span>
                    </div>
                    <Progress value={(k.usedBytes / maxUsed) * 100} aria-label={`${k.label} usage`} />
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Client locations</CardTitle>
            <CardDescription>Where connections come from, by traffic</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            {insights.locations.length === 0 ? (
              <p className="px-4 text-muted-foreground">No location data.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Location</TableHead>
                    <TableHead>Network</TableHead>
                    <TableHead className="text-right">Data</TableHead>
                    <TableHead className="pr-4 text-right">Share</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {insights.locations.map((l, i) => (
                    <TableRow key={`${l.location}-${l.asOrg}-${i}`}>
                      <TableCell className="pl-4 font-medium">{l.location || "Unknown"}</TableCell>
                      <TableCell className="max-w-40 truncate text-muted-foreground">{l.asOrg ?? "-"}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatBytes(l.bytes)}</TableCell>
                      <TableCell className="pr-4 text-right tabular-nums">
                        {((l.bytes / totalLocationBytes) * 100).toFixed(1)}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function rate(bytesPerSecond: number | null) {
  return bytesPerSecond == null ? "-" : `${formatBytes(bytesPerSecond)}/s`;
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}
