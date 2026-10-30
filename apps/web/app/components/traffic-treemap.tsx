import { formatBytes } from "@outline-dash/core/format";
import type { KeyView } from "@outline-dash/core/types";
import { hierarchy, treemap, treemapSquarify } from "d3-hierarchy";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "~/lib/utils";
import { STATUS_FILL, statusLabel } from "./status";

const HEIGHT = 340;

type Tile = { key: KeyView; x: number; y: number; w: number; h: number; share: number };

/**
 * Each key's share of the server's 30-day traffic as a squarified treemap, tinted by
 * status. The line along a tile's bottom is how much of its limit the key has used.
 */
export function TrafficTreemap({ keys }: { keys: KeyView[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<Tile | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry!.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const tiles = useMemo<Tile[]>(() => {
    const used = keys.filter((k) => k.usedBytes > 0);
    const total = used.reduce((n, k) => n + k.usedBytes, 0);
    if (!width || !total) return [];
    const root = hierarchy<{ key?: KeyView; children?: { key: KeyView }[] }>({ children: used.map((key) => ({ key })) })
      .sum((d) => d.key?.usedBytes ?? 0)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    const laid = treemap<typeof root.data>().size([width, HEIGHT]).tile(treemapSquarify.ratio(1.3)).round(true)(root);
    return laid.leaves().map((leaf) => ({
      key: leaf.data.key!,
      x: leaf.x0,
      y: leaf.y0,
      w: leaf.x1 - leaf.x0,
      h: leaf.y1 - leaf.y0,
      share: leaf.data.key!.usedBytes / total,
    }));
  }, [keys, width]);

  if (!keys.some((k) => k.usedBytes > 0)) {
    return <p className="text-muted-foreground">No traffic in the last 30 days.</p>;
  }

  return (
    <div ref={ref} className="relative" style={{ height: HEIGHT }}>
      <svg
        viewBox={`0 0 ${width || 1} ${HEIGHT}`}
        className="block size-full"
        role="img"
        aria-label="Traffic share by key over the last 30 days"
      >
        {tiles.map((t) => {
          const k = t.key;
          const ratio = k.effectiveLimitBytes ? Math.min(1, k.usedBytes / k.effectiveLimitBytes) : 0;
          const muted = k.status === "idle" || k.status === "disabled";
          return (
            <g
              key={k.id}
              tabIndex={0}
              className="outline-none [&:focus-visible>rect:first-child]:stroke-ring"
              onPointerEnter={() => setActive(t)}
              onPointerLeave={() => setActive(null)}
              onFocus={() => setActive(t)}
              onBlur={() => setActive(null)}
            >
              <rect
                x={t.x}
                y={t.y}
                width={t.w}
                height={t.h}
                rx={4}
                // fill-opacity, not opacity, so the 2px gaps between tiles stay solid.
                fillOpacity={active?.key.id === k.id ? 0.4 : muted ? 0.15 : 0.25}
                className={cn(STATUS_FILL[k.status], "stroke-card")}
                strokeWidth={2}
              />
              <circle cx={t.x + 12} cy={t.y + 15} r={3.5} className={STATUS_FILL[k.status]} />
              {t.w > 84 && t.h > 44 && (
                <>
                  <text x={t.x + 21} y={t.y + 19} className="fill-foreground text-[12.5px] font-semibold">
                    {clip(k.label, t.w - 30)}
                  </text>
                  <text x={t.x + 10} y={t.y + 36} className="fill-muted-foreground font-mono text-[11px]">
                    {formatBytes(k.usedBytes)} · {percent(t.share)}
                  </text>
                </>
              )}
              {k.effectiveLimitBytes != null && t.w > 20 && t.h > 14 && (
                <>
                  <rect x={t.x + 6} y={t.y + t.h - 7} width={Math.max(0, t.w - 12)} height={2.5} rx={1.25} className="fill-border" />
                  <rect
                    x={t.x + 6}
                    y={t.y + t.h - 7}
                    width={Math.max(0, (t.w - 12) * ratio)}
                    height={2.5}
                    rx={1.25}
                    className={STATUS_FILL[k.status]}
                  />
                </>
              )}
            </g>
          );
        })}
      </svg>
      {active && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md bg-foreground px-2.5 py-1.5 text-xs whitespace-nowrap text-background shadow-md"
          style={{
            left: width < 240 ? width / 2 : Math.min(Math.max(active.x + active.w / 2, 120), width - 120),
            top: active.y + Math.min(active.h / 2, 40) - 8,
          }}
        >
          <span className="font-semibold">{active.key.label}</span> · {statusLabel(active.key.status)}
          <div className="font-mono text-[11px] opacity-75">
            {formatBytes(active.key.usedBytes)} · {percent(active.share)} of server
            {active.key.effectiveLimitBytes != null &&
              ` · ${Math.round((active.key.usedBytes / active.key.effectiveLimitBytes) * 100)}% of limit`}
          </div>
        </div>
      )}
    </div>
  );
}

function percent(share: number) {
  return `${(share * 100).toFixed(share < 0.1 ? 1 : 0)}%`;
}

/** Rough fit for a label in `px` of width at 12.5px Inter. */
function clip(label: string, px: number) {
  const max = Math.floor(px / 7);
  return label.length > max ? `${label.slice(0, Math.max(1, max - 1))}…` : label;
}
