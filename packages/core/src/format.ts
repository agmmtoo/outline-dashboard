// Decimal units, matching what the Outline Manager shows.
export const GB = 1_000_000_000;

export const gbToBytes = (gb: number) => Math.round(gb * GB);

export function formatBytes(bytes: number | null | undefined, digits = 1): string {
  if (bytes == null) return "-";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit++;
  }
  return `${unit === 0 ? value : value.toFixed(digits)} ${units[unit]}`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return "-";
  const h = Math.floor(seconds / 3600);
  if (h >= 48) return `${Math.round(h / 24)} d`;
  if (h >= 1) return `${h} h`;
  return `${Math.round(seconds / 60)} min`;
}

export function formatRelative(ms: number | null | undefined, now = Date.now()): string {
  if (ms == null) return "never";
  const diff = Math.max(0, now - ms) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86_400) return `${Math.floor(diff / 3600)} h ago`;
  return `${Math.floor(diff / 86_400)} d ago`;
}
