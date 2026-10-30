// DTOs shared by the API worker, the web app and (later) the Telegram bot.
// Never put a server's apiUrl in these: they are sent to clients.

export type KeyStatus = "active" | "near-limit" | "over-limit" | "idle" | "expired" | "disabled";

export interface KeyView {
  id: string;
  /** Raw name as stored in Outline. */
  name: string;
  label: string;
  tags: string[];
  expires: string | null;
  disabled: boolean;
  /** Dynamic access key handle; null when the key only has a static ss:// link. */
  dynamicHandle: string | null;
  /** Code the key's user enters on the public /check page; null for keys made before codes existed. */
  lookupCode: string | null;
  /** ssconf:// link, filled in by the API when dynamic keys are configured. */
  dynamicUrl: string | null;
  port: number;
  method: string;
  accessUrl: string;
  /** Per-key limit, if set. */
  limitBytes: number | null;
  /** Limit actually applied: per-key, else server default, else none. */
  effectiveLimitBytes: number | null;
  limitSource: "key" | "server" | null;
  /** Rolling 30-day transfer. */
  usedBytes: number;
  /** From experimental metrics; null when unavailable. */
  lastSeenMs: number | null;
  peakDevices: number | null;
  status: KeyStatus;
}

export interface ServerView {
  name: string;
  serverId: string;
  version: string;
  createdTimestampMs: number;
  metricsEnabled: boolean;
  hostnameForAccessKeys: string;
  portForNewAccessKeys: number;
  defaultLimitBytes: number | null;
}

/** Cloud instance hosting an Outline server, when configured for power actions. */
export interface InstanceRef {
  provider: "lightsail";
  region: string;
  name: string;
}

export interface InstanceStateView {
  /** Provider state name, e.g. "running", "stopping", "pending". */
  state: string;
  checkedAt: number;
}

/** The few key fields the overview needs to draw each key. */
export type KeyDot = Pick<KeyView, "id" | "label" | "usedBytes" | "effectiveLimitBytes" | "status" | "lastSeenMs">;

export type ServerSummary =
  | {
      id: string;
      ok: true;
      instance: InstanceRef | null;
      server: ServerView;
      keyCount: number;
      usedBytes: number;
      statusCounts: Record<KeyStatus, number>;
      keys: KeyDot[];
    }
  | { id: string; ok: false; label: string; error: string; instance: InstanceRef | null };

export interface LocationView {
  location: string;
  asOrg: string | null;
  bytes: number;
  tunnelSeconds: number;
}

export interface ServerInsights {
  available: boolean;
  tunnelSeconds: number | null;
  bandwidthCurrentBytes: number | null;
  bandwidthPeakBytes: number | null;
  bandwidthPeakAtMs: number | null;
  locations: LocationView[];
}

export interface ServerKeysResponse {
  id: string;
  instance: InstanceRef | null;
  /** Whether the API can issue dynamic (ssconf://) links. */
  dynamicKeys: boolean;
  /** Other configured servers, as move targets. */
  otherServers: Array<{ id: string; name: string }>;
  server: ServerView;
  keys: KeyView[];
  insights: ServerInsights;
}

export interface CreateKeysRequest {
  label: string;
  tags?: string[];
  expires?: string | null;
  limitBytes?: number | null;
  port?: number;
  method?: string;
  count?: number;
  /** Give each key a dynamic (ssconf://) link. */
  dynamic?: boolean;
}

export interface CreatedKeyView {
  id: string;
  name: string;
  accessUrl: string;
  dynamicUrl: string | null;
}

/** What the public /check page shows for one key. Deliberately minimal: no server or link details. */
export interface KeyCheckView {
  label: string;
  status: KeyStatus;
  usedBytes: number;
  limitBytes: number | null;
  expires: string | null;
}
