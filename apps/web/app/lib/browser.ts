import { displayName } from "@outline-dash/core/key-meta";

/** "ss://abc...@host:port/?outline=1" -> "ss://••••••@host:port" */
export function maskAccessUrl(url: string) {
  const at = url.lastIndexOf("@");
  if (at < 0) return "ss://••••••";
  return `ss://••••••${url.slice(at).replace(/\/\?.*$/, "")}`;
}

/**
 * "#name" is shown by Outline clients as the key's display name. With a lookup
 * code it reads "Alice (K7Q2-M9XA-3F)", so users always have their code at hand.
 */
export function shareUrl(accessUrl: string, label: string, lookupCode: string | null = null) {
  return `${accessUrl}#${encodeURIComponent(displayName({ label, code: lookupCode }))}`;
}

/** "ssconf://host/c/<token>#Name" -> "ssconf://host/c/••••••" */
export function maskDynamicUrl(url: string) {
  return url.replace(/\/c\/[^#]*/, "/c/••••••").replace(/#.*$/, "");
}

export interface ShareableLink {
  url: string;
  masked: string;
  dynamic: boolean;
}

/** The link to hand out: the dynamic one when the key has it, else the static ss:// link. */
export function shareableLink(k: {
  accessUrl: string;
  dynamicUrl: string | null;
  label: string;
  lookupCode?: string | null;
}): ShareableLink {
  return k.dynamicUrl
    ? { url: k.dynamicUrl, masked: maskDynamicUrl(k.dynamicUrl), dynamic: true }
    : { url: shareUrl(k.accessUrl, k.label, k.lookupCode), masked: maskAccessUrl(k.accessUrl), dynamic: false };
}

export function downloadCsv(filename: string, rows: string[][]) {
  // Leading =,+,-,@ would be evaluated as a formula by spreadsheet apps.
  const cell = (v: string) => `"${(/^[=+\-@]/.test(v) ? `'${v}` : v).replaceAll('"', '""')}"`;
  const csv = rows.map((r) => r.map(cell).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
