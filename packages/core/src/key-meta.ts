// Outline has no fields for owner, expiry or a disabled flag, so we keep that
// metadata inside the key name itself, as " | "-separated segments:
//
//   "Aung | plus | exp:2026-12-31 | dyn:k3v9x2m7q4tp | off:50000000000"
//
// - first segment: human label
// - "exp:YYYY-MM-DD": expiry date (inclusive)
// - "dyn:<handle>": dynamic access key handle; follows the key across rotate and move
// - "off:<bytes>|none": key is soft-disabled; value is the limit to restore
// - "code:<code>": lookup code the key's user enters on the public /check page
// - anything else: free-form tag

const SEP = " | ";
const EXP_RE = /^exp:(\d{4}-\d{2}-\d{2})$/;
const OFF_RE = /^off:(none|\d+)$/;
const DYN_RE = /^dyn:([a-z2-7]{12,32})$/;
const CODE_RE = /^code:([a-z2-7]{10})$/;
const HANDLE_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

export interface KeyMeta {
  label: string;
  tags: string[];
  expires: string | null;
  /** Dynamic access key handle, when the key has a dynamic (ssconf://) link. */
  dynamic: string | null;
  /** Present only when soft-disabled. `null` means "no per-key limit" before disabling. */
  disabled: { previousLimitBytes: number | null } | null;
  /** Lookup code for the public usage check. Random, never derived from the key's secret. */
  code: string | null;
}

export function parseKeyName(name: string): KeyMeta {
  const meta: KeyMeta = { label: "", tags: [], expires: null, dynamic: null, disabled: null, code: null };
  const segments = name.split("|").map((s) => s.trim()).filter(Boolean);

  segments.forEach((segment, i) => {
    const exp = EXP_RE.exec(segment);
    if (exp) {
      meta.expires = exp[1]!;
      return;
    }
    const dyn = DYN_RE.exec(segment);
    if (dyn) {
      meta.dynamic = dyn[1]!;
      return;
    }
    const code = CODE_RE.exec(segment);
    if (code) {
      meta.code = code[1]!;
      return;
    }
    const off = OFF_RE.exec(segment);
    if (off) {
      meta.disabled = { previousLimitBytes: off[1] === "none" ? null : Number(off[1]) };
      return;
    }
    if (i === 0) meta.label = segment;
    else meta.tags.push(segment);
  });

  return meta;
}

export function formatKeyName(meta: KeyMeta): string {
  // "|" inside a label or tag would corrupt parsing.
  const clean = (s: string) => s.replaceAll("|", "/").trim();
  const segments = [clean(meta.label) || "Unnamed", ...meta.tags.map(clean).filter(Boolean)];
  if (meta.expires) segments.push(`exp:${meta.expires}`);
  if (meta.dynamic) segments.push(`dyn:${meta.dynamic}`);
  if (meta.code) segments.push(`code:${meta.code}`);
  if (meta.disabled) segments.push(`off:${meta.disabled.previousLimitBytes ?? "none"}`);
  return segments.join(SEP);
}

export function isExpired(expires: string | null, now = new Date()): boolean {
  if (!expires) return false;
  // Expiry date is inclusive: the key is valid through the end of that day (UTC).
  return now.toISOString().slice(0, 10) > expires;
}

/** Random 16-character base32 handle (80 bits). */
export function newDynamicHandle(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => HANDLE_ALPHABET[b & 31]).join("");
}

/** Random 10-character base32 lookup code (50 bits): too many to guess, short enough to type. */
export function newLookupCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => HANDLE_ALPHABET[b & 31]).join("");
}

/** "k7q2m9xa3f" -> "K7Q2-M9XA-3F" */
export function formatLookupCode(code: string): string {
  const c = code.toUpperCase();
  return `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8)}`;
}

/** Accepts what people type: any case, dashes or spaces, and 0/1 mistaken for O/L. Null if it can't be a code. */
export function normalizeLookupCode(input: string): string | null {
  const c = input.toLowerCase().replace(/[\s-]/g, "").replaceAll("0", "o").replaceAll("1", "l");
  return /^[a-z2-7]{10}$/.test(c) ? c : null;
}

/** The name Outline clients show for the key: the label, plus its lookup code when it has one. */
export function displayName(meta: Pick<KeyMeta, "label" | "code">): string {
  return meta.code ? `${meta.label} (${formatLookupCode(meta.code)})` : meta.label;
}
