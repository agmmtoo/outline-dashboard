import { formatBytes } from "@outline-dash/core/format";
import type { LocationView } from "@outline-dash/core/types";
import { useMemo, useState } from "react";
import { Button } from "./ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

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
 * Where traffic comes from, as two ranked bar charts: by country and by network.
 * One hue (magnitude, not identity); value at each bar's tip; hover for the
 * breakdown. The full table stays one click away.
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

function Bars({ title, rows, total, detailLabel }: { title: string; rows: Row[]; total: number; detailLabel: string }) {
  const max = rows[0]?.bytes || 1;
  return (
    <figure className="min-w-0 space-y-2">
      <figcaption className="text-xs font-semibold">{title}</figcaption>
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.name}>
            <Tooltip>
              <TooltipTrigger
                render={
                  <div
                    tabIndex={0}
                    className="group grid grid-cols-[minmax(0,8.5rem)_1fr] items-center gap-3 py-1 outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                }
              >
                <span className="truncate text-xs">{r.name}</span>
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-4 shrink-0 rounded-r-[4px] bg-primary transition-[filter] group-hover:brightness-110 dark:bg-teal-400/80"
                    style={{
                      width: `max(2px, calc((100% - 6.5rem) * ${r.bytes / max}))`,
                    }}
                  />
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {formatBytes(r.bytes)} · {percent(r.bytes / total)}
                  </span>
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-72">
                {/* One block: the popup lays out its children in a row. */}
                <div className="min-w-48">
                  <p className="font-medium">
                    {r.name}: {formatBytes(r.bytes)} ({percent(r.bytes / total)})
                  </p>
                  <p className="mt-1 opacity-75">{detailLabel}</p>
                  <ul className="tabular-nums">
                    {r.detail.slice(0, 5).map((d, i) => (
                      <li key={`${d.name}-${i}`} className="flex justify-between gap-4">
                        <span className="min-w-0 truncate">{d.name}</span>
                        <span className="shrink-0 whitespace-nowrap">{formatBytes(d.bytes)}</span>
                      </li>
                    ))}
                    {r.detail.length > 5 && <li className="opacity-75">and {r.detail.length - 5} more</li>}
                  </ul>
                </div>
              </TooltipContent>
            </Tooltip>
          </li>
        ))}
      </ul>
    </figure>
  );
}

function percent(share: number) {
  return `${(share * 100).toFixed(share < 0.1 ? 1 : 0)}%`;
}
