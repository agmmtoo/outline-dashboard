import { formatBytes, formatDuration, formatRelative } from "@outline-dash/core/format";
import type { KeyView, ServerInsights } from "@outline-dash/core/types";
import { FlaskConicalIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { LocationsChart } from "./locations-chart";
import { TrafficTreemap } from "./traffic-treemap";

export function InsightsPanel({ keys, insights }: { keys: KeyView[]; insights: ServerInsights }) {

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

      <Card>
        <CardHeader>
          <CardTitle>Traffic share</CardTitle>
          <CardDescription>
            Each key's share of the last 30 days of traffic. The line along a tile's bottom is how much of its limit it has
            used.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TrafficTreemap keys={keys} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Client locations</CardTitle>
          <CardDescription>Where connections come from, by traffic over the last 30 days. Hover a bar for the breakdown.</CardDescription>
        </CardHeader>
        <CardContent>
          {insights.locations.length === 0 ? (
            <p className="text-muted-foreground">No location data.</p>
          ) : (
            <LocationsChart locations={insights.locations} />
          )}
        </CardContent>
      </Card>
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
