import { formatBytes } from "@outline-dash/core/format";
import type { LocationView } from "@outline-dash/core/types";
import { useMemo, useState } from "react";
import { Bar, BarChart, LabelList, XAxis, YAxis } from "recharts";
import { MAGNITUDE } from "~/lib/chart-colors";
import { ChartTooltipPanel, endLabel, percent, SingleLineTick } from "./chart-tooltip";
import { Button } from "./ui/button";
import { ChartContainer, ChartTooltip, type ChartConfig } from "./ui/chart";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";

const MAX_ROWS = 8;

type Row = {
  name: string;
  bytes: number;
  detail: Array<{ name: string; bytes: number }>;
};

const regionNames = (() => {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    return null;
  }
})();

/** "MM" -> "Myanmar"; falls back to the code. */
function countryName(code: string) {
  if (!code) return "Unknown";
  try {
    return regionNames?.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

/** Groups by `by`, sorts by traffic and folds anything past MAX_ROWS into "Other". */
function group(locations: LocationView[], by: (l: LocationView) => string, sub: (l: LocationView) => string): Row[] {
  const map = new Map<string, Row>();
  for (const l of locations) {
    const name = by(l);
    const row = map.get(name) ?? { name, bytes: 0, detail: [] };
    row.bytes += l.bytes;
    row.detail.push({ name: sub(l), bytes: l.bytes });
    map.set(name, row);
  }
  const rows = [...map.values()].sort((a, b) => b.bytes - a.bytes);
  for (const r of rows) r.detail.sort((a, b) => b.bytes - a.bytes);
  if (rows.length <= MAX_ROWS) return rows;
  const rest = rows.slice(MAX_ROWS - 1);
  const other: Row = {
    name: `Other (${rest.length})`,
    bytes: rest.reduce((n, r) => n + r.bytes, 0),
    detail: rest.map((r) => ({ name: r.name, bytes: r.bytes })),
  };
  return [...rows.slice(0, MAX_ROWS - 1), other];
}

/**
 * Where traffic comes from, as two ranked bar charts (Recharts): by country and by
 * network. One hue (magnitude, not identity); value at each bar's tip; hover for
 * the breakdown. The full table stays one click away.
 */
export function LocationsChart({ locations }: { locations: LocationView[] }) {
  const [asTable, setAsTable] = useState(false);
  const total = locations.reduce((n, l) => n + l.bytes, 0) || 1;
  const countries = useMemo(
    () =>
      group(
        locations,
        (l) => countryName(l.location),
        (l) => l.asOrg ?? "Unknown network",
      ),
    [locations],
  );
  const networks = useMemo(
    () =>
      group(
        locations,
        (l) => l.asOrg ?? "Unknown network",
        (l) => countryName(l.location),
      ),
    [locations],
  );

  return (
    <div className="space-y-4">
      {asTable ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Location</TableHead>
              <TableHead>Network</TableHead>
              <TableHead className="text-right">Data</TableHead>
              <TableHead className="text-right">Share</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {locations.map((l, i) => (
              <TableRow key={`${l.location}-${l.asOrg}-${i}`}>
                <TableCell className="font-medium">{countryName(l.location)}</TableCell>
                <TableCell className="max-w-48 truncate text-muted-foreground">{l.asOrg ?? "-"}</TableCell>
                <TableCell className="text-right tabular-nums">{formatBytes(l.bytes)}</TableCell>
                <TableCell className="text-right tabular-nums">{percent(l.bytes / total)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          <Bars title="By country" rows={countries} total={total} detailLabel="Networks" />
          <Bars title="By network" rows={networks} total={total} detailLabel="Countries" />
        </div>
      )}
      <Button variant="link" size="xs" className="h-auto px-0" onClick={() => setAsTable((v) => !v)}>
        {asTable ? "Show as charts" : "Show as table"}
      </Button>
    </div>
  );
}

const config = { bytes: { label: "Traffic", theme: MAGNITUDE } } satisfies ChartConfig;
const BAR_ROW = 30;

function Bars({ title, rows, total, detailLabel }: { title: string; rows: Row[]; total: number; detailLabel: string }) {
  return (
    <figure className="min-w-0 space-y-2">
      <figcaption className="text-xs font-semibold">{title}</figcaption>
      <ChartContainer config={config} className="aspect-auto w-full" style={{ height: rows.length * BAR_ROW + 8 }}>
        <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 112, bottom: 0, left: 0 }} barCategoryGap={6}>
          <XAxis type="number" dataKey="bytes" hide />
          <YAxis
            type="category"
            dataKey="name"
            width={136}
            tickLine={false}
            axisLine={false}
            tick={<SingleLineTick max={18} />}
          />
          <ChartTooltip
            cursor={{ fill: "var(--muted)", opacity: 0.5 }}
            content={({ active, payload }) => {
              const r = payload?.[0]?.payload as Row | undefined;
              if (!active || !r) return null;
              return (
                <ChartTooltipPanel>
                  <p className="font-medium">
                    {r.name}: {formatBytes(r.bytes)} ({percent(r.bytes / total)})
                  </p>
                  <p className="text-muted-foreground">{detailLabel}</p>
                  <ul className="tabular-nums">
                    {r.detail.slice(0, 5).map((d, i) => (
                      <li key={`${d.name}-${i}`} className="flex justify-between gap-4">
                        <span className="min-w-0 truncate">{d.name}</span>
                        <span className="shrink-0 font-mono">{formatBytes(d.bytes)}</span>
                      </li>
                    ))}
                    {r.detail.length > 5 && <li className="text-muted-foreground">and {r.detail.length - 5} more</li>}
                  </ul>
                </ChartTooltipPanel>
              );
            }}
          />
          <Bar dataKey="bytes" fill="var(--color-bytes)" radius={[0, 4, 4, 0]} maxBarSize={18} minPointSize={2}>
            <LabelList dataKey="bytes" content={endLabel((v) => `${formatBytes(v)} · ${percent(v / total)}`)} />
          </Bar>
        </BarChart>
      </ChartContainer>
    </figure>
  );
}
