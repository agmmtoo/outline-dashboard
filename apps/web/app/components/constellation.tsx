import { formatBytes, formatRelative } from "@outline-dash/core/format";
import type { KeyDot, KeyStatus, ServerSummary } from "@outline-dash/core/types";
import { useQueries } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { instanceQuery } from "~/lib/query";
import { statusLabel } from "./status";

// Tailwind's 500 shades, matching the status dots elsewhere in the app.
const STATUS_HEX: Record<KeyStatus, string> = {
  active: "#10b981",
  "near-limit": "#f59e0b",
  "over-limit": "#ef4444",
  idle: "",
  expired: "#f97316",
  disabled: "",
};
const AMBER = "#f59e0b";
const ROW_NARROW = 190;
const ROW_WIDE = 320;
const MAX_COLS = 4;

type Dot = { key: KeyDot; ring: number; phase: number; r: number; orbit: number; x: number; y: number };
type Node = { summary: ServerSummary; name: string; cx: number; cy: number; maxR: number; dots: Dot[]; flash: number | null };
type Theme = { fg: string; muted: string; border: string; card: string; destructive: string; font: string };
type Hover = { dot: Dot } | { node: Node } | null;

function readTheme(el: Element): Theme {
  const cs = getComputedStyle(el);
  const v = (n: string) => cs.getPropertyValue(n).trim();
  return {
    fg: v("--foreground"),
    muted: v("--muted-foreground"),
    border: v("--border"),
    card: v("--card"),
    destructive: v("--destructive"),
    font: getComputedStyle(document.body).fontFamily,
  };
}

/**
 * Overview showpiece: each server is a node with its keys orbiting it. Dot size is
 * 30-day traffic and color is key status. An unreachable server pulses red, and a
 * rebooting one pulses amber (read from the same cached instance state the reboot
 * control polls, so this adds no requests). Static with reduced motion, and only
 * animates while visible.
 */
export default function Constellation({ servers }: { servers: ServerSummary[] }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const navigate = useNavigate();
  const [hover, setHover] = useState<Hover>(null);
  const [height, setHeight] = useState(ROW_WIDE);

  const withInstance = servers.filter((s) => s.instance);
  const instanceStates = useQueries({
    queries: withInstance.map((s) => instanceQuery(s.id)),
    combine: (results) => Object.fromEntries(results.map((r, i) => [withInstance[i]!.id, r.data?.state])),
  });

  // The draw loop reads these refs so it never restarts on re-render.
  const nodes = useRef<Node[]>([]);
  const states = useRef(instanceStates);
  const hoverRef = useRef<Hover>(null);
  const prevStates = useRef<Record<string, string | undefined>>({});
  const t0 = useRef(performance.now());
  states.current = instanceStates;
  hoverRef.current = hover;

  // Flash a green ring when an instance comes back to "running".
  useEffect(() => {
    for (const n of nodes.current) {
      const before = prevStates.current[n.summary.id];
      if (before && before !== "running" && instanceStates[n.summary.id] === "running") {
        n.flash = (performance.now() - t0.current) / 1000;
      }
    }
    prevStates.current = instanceStates;
  }, [instanceStates]);

  useEffect(() => {
    const el = wrap.current;
    const cv = canvas.current;
    const ctx = cv?.getContext("2d");
    if (!el || !cv || !ctx) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let theme = readTheme(el);
    let W = 0;
    let H = 0;
    let raf = 0;
    let visible = true;
    const STILL_T = 2.2;

    const layout = () => {
      W = el.clientWidth;
      const narrow = W < 560;
      const cols = narrow ? 1 : Math.min(servers.length, MAX_COLS);
      const rows = Math.ceil(servers.length / cols);
      const rowH = narrow ? ROW_NARROW : ROW_WIDE;
      H = rows * rowH;
      setHeight(H);
      const dpr = Math.min(devicePixelRatio || 1, 2);
      cv.width = W * dpr;
      cv.height = H * dpr;
      cv.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const maxUsed = Math.max(1, ...servers.flatMap((s) => (s.ok ? s.keys.map((k) => k.usedBytes) : [])));
      const colW = W / cols;
      const old = new Map(nodes.current.map((n) => [n.summary.id, n.flash]));
      nodes.current = servers.map((s, i) => {
        const cx = colW * ((i % cols) + 0.5);
        const cy = rowH * (Math.floor(i / cols) + 0.45);
        const maxR = Math.max(36, Math.min(colW / 2 - 16, rowH / 2 - 34));
        const keys = s.ok ? s.keys : [];
        return {
          summary: s,
          name: s.ok ? s.server.name : s.label,
          cx,
          cy,
          maxR,
          flash: old.get(s.id) ?? null,
          dots: keys.map((key, j) => ({
            key,
            ring: j % 3,
            phase: j * 2.39996 + i,
            r: 2.5 + 10 * Math.sqrt(key.usedBytes / maxUsed),
            orbit: maxR * (0.45 + 0.27 * (j % 3)),
            x: cx,
            y: cy,
          })),
        };
      });
    };

    const draw = (t: number) => {
      ctx.clearRect(0, 0, W, H);
      const pulse = 0.5 + 0.5 * Math.sin(t * 3);
      const hv = hoverRef.current;
      for (const n of nodes.current) {
        const { summary: s, cx, cy } = n;
        const state = states.current[s.id];
        const down = !s.ok;
        const rebooting = !!s.instance && !!state && state !== "running";

        ctx.lineWidth = 1;
        ctx.setLineDash([2, 4]);
        ctx.strokeStyle = theme.border;
        for (let ring = 0; ring < 3 && !down; ring++) {
          ctx.beginPath();
          ctx.arc(cx, cy, n.maxR * (0.45 + 0.27 * ring), 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.setLineDash([]);

        for (const d of n.dots) {
          const speed = (0.14 / (d.ring + 1)) * (rebooting ? 0.25 : 1);
          const a = d.phase + t * speed;
          d.x = cx + Math.cos(a) * d.orbit;
          d.y = cy + Math.sin(a) * d.orbit * 0.82;
          const color = STATUS_HEX[d.key.status] || theme.muted;
          const dim = d.key.status === "idle" || d.key.status === "disabled";
          if (hv && "dot" in hv && hv.dot === d) {
            ctx.globalAlpha = 0.2;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(d.x, d.y, d.r + 7, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.globalAlpha = rebooting ? 0.3 : dim ? 0.55 : 1;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
          ctx.fill();
          if (d.key.status === "over-limit") {
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = color;
            ctx.beginPath();
            ctx.arc(d.x, d.y, d.r + 3 + pulse * 2, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
        ctx.globalAlpha = 1;

        const core = down ? theme.destructive : rebooting ? AMBER : STATUS_HEX.active;
        if (down || rebooting) {
          ctx.strokeStyle = core;
          ctx.lineWidth = 2;
          ctx.globalAlpha = 0.25 + 0.5 * (1 - pulse);
          ctx.beginPath();
          ctx.arc(cx, cy, 16 + pulse * 10, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        if (n.flash != null) {
          const f = (t - n.flash) / 1.2;
          if (f >= 0 && f < 1) {
            ctx.strokeStyle = STATUS_HEX.active;
            ctx.lineWidth = 2;
            ctx.globalAlpha = 1 - f;
            ctx.beginPath();
            ctx.arc(cx, cy, 14 + f * n.maxR, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1;
          } else if (f >= 1 || reduced.matches) n.flash = null;
        }
        const hot = hv && "node" in hv && hv.node === n;
        ctx.fillStyle = theme.card;
        ctx.beginPath();
        ctx.arc(cx, cy, hot ? 15 : 13, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = core;
        ctx.stroke();
        ctx.fillStyle = core;
        ctx.beginPath();
        ctx.arc(cx, cy, 4, 0, Math.PI * 2);
        ctx.fill();

        const used = s.ok ? s.usedBytes : 0;
        const ly = Math.min(cy + (down ? 34 : n.maxR * 0.82 + 22), H - 22);
        ctx.textAlign = "center";
        ctx.fillStyle = down ? theme.muted : theme.fg;
        ctx.font = `600 12px ${theme.font}`;
        ctx.fillText(n.name, cx, ly);
        ctx.font = `500 11px ${theme.font}`;
        ctx.fillStyle = down ? theme.destructive : theme.muted;
        ctx.fillText(
          down ? "Unreachable" : rebooting ? `Instance ${state}…` : `${n.dots.length} keys · ${formatBytes(used)}`,
          cx,
          ly + 15,
        );
      }
    };

    const loop = (now: number) => {
      draw((now - t0.current) / 1000);
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      cancelAnimationFrame(raf);
      // Paint now so the canvas is never blank while waiting for the first frame.
      draw(reduced.matches ? STILL_T : (performance.now() - t0.current) / 1000);
      if (!reduced.matches && visible && !document.hidden) raf = requestAnimationFrame(loop);
    };

    layout();
    start();
    const ro = new ResizeObserver(() => {
      layout();
      start();
    });
    ro.observe(el);
    const io = new IntersectionObserver(([entry]) => {
      visible = entry!.isIntersecting;
      start();
    });
    io.observe(el);
    // next-themes toggles the "dark" class on <html>.
    const mo = new MutationObserver(() => {
      theme = readTheme(el);
      start();
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    document.addEventListener("visibilitychange", start);
    reduced.addEventListener("change", start);
    // With reduced motion there is no loop, so redraw on hover and state changes.
    const redraw = () => reduced.matches && draw(STILL_T);
    el.addEventListener("pointermove", redraw);
    el.addEventListener("constellation:redraw", redraw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      mo.disconnect();
      document.removeEventListener("visibilitychange", start);
      reduced.removeEventListener("change", start);
      el.removeEventListener("pointermove", redraw);
      el.removeEventListener("constellation:redraw", redraw);
    };
  }, [servers]);

  useEffect(() => {
    wrap.current?.dispatchEvent(new Event("constellation:redraw"));
  }, [instanceStates, hover]);

  const hit = (e: React.MouseEvent): Hover => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    for (const n of nodes.current) {
      if (Math.hypot(n.cx - x, n.cy - y) < 18) return { node: n };
      for (const d of n.dots) if (Math.hypot(d.x - x, d.y - y) < d.r + 5) return { dot: d };
    }
    return null;
  };

  const down = servers.filter((s) => !s.ok).length;
  const summary = `${servers.length} servers${down ? `, ${down} unreachable` : ""}, ${servers.reduce((n, s) => n + (s.ok ? s.keyCount : 0), 0)} keys`;

  return (
    <div
      ref={wrap}
      className="relative overflow-hidden"
      style={{ height }}
      onPointerMove={(e) => setHover(hit(e))}
      onPointerLeave={() => setHover(null)}
      onClick={(e) => {
        const h = hit(e);
        if (h && "node" in h) navigate(`/servers/${h.node.summary.id}`);
      }}
    >
      <canvas
        ref={canvas}
        className={hover && "node" in hover ? "block w-full cursor-pointer" : "block w-full"}
        role="img"
        aria-label={`Servers and their access keys: ${summary}`}
      />
      {hover && <Tooltip hover={hover} width={wrap.current?.clientWidth ?? 0} />}
    </div>
  );
}

function Tooltip({ hover, width }: { hover: NonNullable<Hover>; width: number }) {
  const at = "dot" in hover ? { x: hover.dot.x, y: hover.dot.y - hover.dot.r } : { x: hover.node.cx, y: hover.node.cy - 18 };
  return (
    <div
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md bg-foreground px-2.5 py-1.5 text-xs whitespace-nowrap text-background shadow-md"
      style={{ left: width < 200 ? width / 2 : Math.min(Math.max(at.x, 100), width - 100), top: at.y - 8 }}
    >
      {"dot" in hover ? (
        <>
          <span className="font-semibold">{hover.dot.key.label}</span> · {statusLabel(hover.dot.key.status)}
          <div className="font-mono text-[11px] opacity-75">
            {formatBytes(hover.dot.key.usedBytes)}
            {hover.dot.key.effectiveLimitBytes != null
              ? ` of ${formatBytes(hover.dot.key.effectiveLimitBytes)}`
              : " · no limit"}
            {/* The overview loads without metrics, so last-seen is often unknown here. */}
            {hover.dot.key.lastSeenMs != null && ` · seen ${formatRelative(hover.dot.key.lastSeenMs)}`}
          </div>
        </>
      ) : (
        <>
          <span className="font-semibold">{hover.node.name}</span>
          <div className="text-[11px] opacity-75">Open server</div>
        </>
      )}
    </div>
  );
}
