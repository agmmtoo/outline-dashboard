import { formatBytes } from "@outline-dash/core/format";
import type { KeyView } from "@outline-dash/core/types";
import { Treemap } from "recharts";
import { STATUS_COLOR } from "~/lib/chart-colors";
import { ChartTooltipPanel, percent } from "./chart-tooltip";
import { STATUS_ORDER, statusLabel } from "./status";
import { ChartContainer, ChartTooltip, type ChartConfig } from "./ui/chart";

const HEIGHT = 340;

// Not `key`: Recharts spreads data fields onto the tile as props, and React drops `key`.
type Leaf = { name: string; size: number; view: KeyView; share: number };

// Legend/tooltip labels for the status tints.
const config = Object.fromEntries(
  STATUS_ORDER.map((s) => [s, { label: statusLabel(s), color: STATUS_COLOR[s] }]),
) satisfies ChartConfig;

/**
 * Each key's share of the server's 30-day traffic as a squarified treemap (Recharts),
 * tinted by status. The line along a tile's bottom is how much of its limit the key
 * has used.
 */
export function TrafficTreemap({ keys }: { keys: KeyView[] }) {
  const used = keys.filter((k) => k.usedBytes > 0);
  const total = used.reduce((n, k) => n + k.usedBytes, 0);
  if (!total) return <p className="text-muted-foreground">No traffic in the last 30 days.</p>;

  const data: Leaf[] = used
    .sort((a, b) => b.usedBytes - a.usedBytes)
    .map((view) => ({ name: view.label, size: view.usedBytes, view, share: view.usedBytes / total }));

  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height: HEIGHT }}>
      <Treemap
        data={data}
        dataKey="size"
        nameKey="name"
        aspectRatio={1.3}
        isAnimationActive={false}
        content={<Tile />}
      >
        <ChartTooltip
          content={({ active, payload }) => {
            const leaf = payload?.[0]?.payload as Leaf | undefined;
            if (!active || !leaf?.view) return null;
            const k = leaf.view;
            return (
              <ChartTooltipPanel>
                <p className="flex items-center gap-1.5 font-medium">
                  <span className="size-2.5 shrink-0" style={{ background: STATUS_COLOR[k.status] }} />
                  {k.label}
                  <span className="font-normal text-muted-foreground">· {statusLabel(k.status)}</span>
                </p>
                <p className="font-mono text-muted-foreground tabular-nums">
                  {formatBytes(k.usedBytes)} · {percent(leaf.share)} of server
                  {k.effectiveLimitBytes != null &&
                    ` · ${Math.round((k.usedBytes / k.effectiveLimitBytes) * 100)}% of limit`}
                </p>
              </ChartTooltipPanel>
            );
          }}
        />
      </Treemap>
    </ChartContainer>
  );
}

/** Custom tile: status tint, name and size when it fits, and a limit line along the bottom. */
function Tile(props: { x?: number; y?: number; width?: number; height?: number; depth?: number } & Partial<Leaf>) {
  const { x = 0, y = 0, width: w = 0, height: h = 0, depth, view: k, share = 0 } = props;
  if (depth !== 1 || !k) return null;
  const color = STATUS_COLOR[k.status];
  const muted = k.status === "idle" || k.status === "disabled";
  const ratio = k.effectiveLimitBytes ? Math.min(1, k.usedBytes / k.effectiveLimitBytes) : 0;

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={4}
        // fill-opacity, not opacity, so the 2px surface gaps between tiles stay solid.
        fill={color}
        fillOpacity={muted ? 0.15 : 0.25}
        className="stroke-card transition-[fill-opacity] hover:[fill-opacity:0.4]"
        strokeWidth={2}
      />
      <circle cx={x + 12} cy={y + 15} r={3.5} fill={color} />
      {w > 84 && h > 44 && (
        <>
          <text x={x + 21} y={y + 19} className="fill-foreground text-[12.5px] font-semibold">
            {clip(k.label, w - 30)}
          </text>
          <text x={x + 10} y={y + 36} className="fill-muted-foreground font-mono text-[11px]">
            {formatBytes(k.usedBytes)} · {percent(share)}
          </text>
        </>
      )}
      {k.effectiveLimitBytes != null && w > 20 && h > 14 && (
        <>
          <rect x={x + 6} y={y + h - 7} width={Math.max(0, w - 12)} height={2.5} rx={1.25} className="fill-border" />
          <rect x={x + 6} y={y + h - 7} width={Math.max(0, (w - 12) * ratio)} height={2.5} rx={1.25} fill={color} />
        </>
      )}
    </g>
  );
}

/** Rough fit for a label in `px` of width at 12.5px Inter. */
function clip(label: string, px: number) {
  const max = Math.floor(px / 7);
  return label.length > max ? `${label.slice(0, Math.max(1, max - 1))}…` : label;
}
