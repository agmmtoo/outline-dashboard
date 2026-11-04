import { cn } from "~/lib/utils";

/** Frame for custom Recharts tooltips, matching shadcn's ChartTooltipContent. */
export function ChartTooltipPanel({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "grid min-w-40 max-w-72 gap-1 rounded-none border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl",
        className,
      )}
      {...props}
    />
  );
}

export function percent(share: number) {
  return `${(share * 100).toFixed(share < 0.1 ? 1 : 0)}%`;
}

/** Y-axis category tick on one line (Recharts wraps by default), truncated to `max` characters. */
export function SingleLineTick({
  x = 0,
  y = 0,
  payload,
  max = 20,
}: {
  x?: number | string;
  y?: number | string;
  payload?: { value?: unknown };
  max?: number;
}) {
  const text = String(payload?.value ?? "");
  return (
    <text x={Number(x)} y={Number(y)} dy="0.35em" textAnchor="end" className="fill-muted-foreground text-xs">
      <title>{text}</title>
      {text.length > max ? `${text.slice(0, max - 1)}…` : text}
    </text>
  );
}

/** LabelList content: the value just past the bar's end, on one line. */
export function endLabel(format: (value: number) => string) {
  return function EndLabel(props: { x?: number | string; y?: number | string; width?: number | string; height?: number | string; value?: unknown }) {
    const x = Number(props.x ?? 0) + Number(props.width ?? 0) + 8;
    const y = Number(props.y ?? 0) + Number(props.height ?? 0) / 2;
    return (
      <text x={x} y={y} dy="0.35em" className="fill-muted-foreground text-xs tabular-nums">
        {format(Number(props.value))}
      </text>
    );
  };
}
