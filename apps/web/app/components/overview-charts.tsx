import { formatBytes } from "@outline-dash/core/format";
import type { KeyStatus, ServerSummary } from "@outline-dash/core/types";
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts";
import { MAGNITUDE, STATUS_COLOR } from "~/lib/chart-colors";
import { ChartTooltipPanel, endLabel, percent, SingleLineTick } from "./chart-tooltip";
import { STATUS_ORDER, statusLabel } from "./status";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "./ui/chart";

const ROW = 34;
const trafficConfig = { traffic: { label: "Traffic", theme: MAGNITUDE } } satisfies ChartConfig;
const statusConfig = Object.fromEntries(
  STATUS_ORDER.map((s) => [s, { label: statusLabel(s), color: STATUS_COLOR[s] }]),
) satisfies ChartConfig;

type Healthy = Extract<ServerSummary, { ok: true }>;


/** Traffic per server and the status mix of each server's keys, side by side. */
export function OverviewCharts({ servers }: { servers: ServerSummary[] }) {
  const healthy = servers.filter((s): s is Healthy => s.ok);
  if (healthy.length === 0) return null;
  const total = healthy.reduce((n, s) => n + s.usedBytes, 0) || 1;

  const traffic = [...healthy]
    .sort((a, b) => b.usedBytes - a.usedBytes)
    .map((s) => ({ name: s.server.name, traffic: s.usedBytes }));

  const statuses = [...healthy]
    .sort((a, b) => b.keyCount - a.keyCount)
    .map((s) => ({ name: s.server.name, ...s.statusCounts }));
  // Only statuses that occur, so the legend lists nothing absent.
  const present = STATUS_ORDER.filter((st) => healthy.some((s) => s.statusCounts[st] > 0));
  const height = healthy.length * ROW + 16;

  return (
    <section className="grid gap-3 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Traffic by server</CardTitle>
          <CardDescription>Last 30 days</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={trafficConfig} className="aspect-auto w-full" style={{ height }}>
            <BarChart data={traffic} layout="vertical" margin={{ top: 0, right: 96, bottom: 0, left: 0 }} barCategoryGap={8}>
              <XAxis type="number" dataKey="traffic" hide />
              <YAxis type="category" dataKey="name" width={128} tickLine={false} axisLine={false} tick={<SingleLineTick max={17} />} />
              <ChartTooltip
                cursor={{ fill: "var(--muted)", opacity: 0.5 }}
                content={({ active, payload }) => {
                  const row = payload?.[0]?.payload as (typeof traffic)[number] | undefined;
                  if (!active || !row) return null;
                  return (
                    <ChartTooltipPanel>
                      <p className="font-medium">{row.name}</p>
                      <p className="font-mono text-muted-foreground tabular-nums">
                        {formatBytes(row.traffic)} · {percent(row.traffic / total)} of all traffic
                      </p>
                    </ChartTooltipPanel>
                  );
                }}
              />
              <Bar dataKey="traffic" fill="var(--color-traffic)" radius={[0, 4, 4, 0]} maxBarSize={20} minPointSize={2}>
                <LabelList dataKey="traffic" content={endLabel(formatBytes)} />
              </Bar>
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Keys by status</CardTitle>
          <CardDescription>How each server's keys are doing</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={statusConfig} className="aspect-auto w-full" style={{ height: height + 32 }}>
            <BarChart data={statuses} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }} barCategoryGap={8}>
              <CartesianGrid horizontal={false} strokeDasharray="3 3" />
              <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="name" width={128} tickLine={false} axisLine={false} tick={<SingleLineTick max={17} />} />
              <ChartTooltip cursor={{ fill: "var(--muted)", opacity: 0.5 }} content={<ChartTooltipContent hideIndicator={false} />} />
              <ChartLegend content={<ChartLegendContent />} itemSorter={null} />
              {present.map((st: KeyStatus, i) => (
                <Bar
                  key={st}
                  dataKey={st}
                  stackId="keys"
                  fill={`var(--color-${st})`}
                  // 2px surface gap between stacked segments; round only the outer end.
                  stroke="var(--card)"
                  strokeWidth={2}
                  radius={i === present.length - 1 ? [0, 4, 4, 0] : 0}
                  maxBarSize={20}
                />
              ))}
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </section>
  );
}
