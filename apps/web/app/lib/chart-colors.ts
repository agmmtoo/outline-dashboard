import type { KeyStatus } from "@outline-dash/core/types";

// Chart colors, validated with the dataviz palette checks against the card surface
// in each mode (lightness band, chroma floor, >= 3:1 contrast).

/**
 * One hue for magnitude (bars, rings, gauges): the preset's teal-green ramp.
 * --chart-2 is too light for the dark band, so dark mode steps down to --chart-3.
 */
export const MAGNITUDE = { light: "var(--chart-4)", dark: "var(--chart-3)" };

/**
 * Status is a reserved palette (Tailwind 500s, matching the status dots). Always
 * shown with a label (legend, tooltip, badge), never color alone.
 */
export const STATUS_COLOR: Record<KeyStatus, string> = {
  active: "#10b981",
  "near-limit": "#f59e0b",
  "over-limit": "#ef4444",
  expired: "#f97316",
  idle: "color-mix(in oklab, var(--muted-foreground) 45%, transparent)",
  disabled: "var(--muted-foreground)",
};

/** Ring/gauge color for usage against a limit: amber from 80%, red at 100%. */
export function usageColor(ratio: number, limit: number | null, off = false) {
  if (off || limit == null) return "var(--muted-foreground)";
  if (ratio >= 1) return "var(--destructive)";
  if (ratio >= 0.8) return STATUS_COLOR["near-limit"];
  return "var(--color-usage)";
}
