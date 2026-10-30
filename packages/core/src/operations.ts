import type {
  AccessKey,
  ExperimentalMetrics,
  OutlineClient,
  ServerInfo,
} from "@outline-dash/outline-client";
import { formatKeyName, isExpired, newDynamicHandle, newLookupCode, parseKeyName, type KeyMeta } from "./key-meta";
import type {
  CreateKeysRequest,
  KeyStatus,
  KeyView,
  ServerInsights,
  ServerKeysResponse,
  ServerView,
} from "./types";

export const NEAR_LIMIT_RATIO = 0.8;
export const IDLE_AFTER_MS = 14 * 24 * 3600 * 1000;
// Workers free plan allows 50 subrequests per invocation; leave headroom.
export const MAX_BULK_CREATE = 40;

export class OperationError extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    message: string,
  ) {
    super(message);
    this.name = "OperationError";
  }
}

export function toServerView(info: ServerInfo): ServerView {
  return {
    name: info.name,
    serverId: info.serverId,
    version: info.version,
    createdTimestampMs: info.createdTimestampMs,
    metricsEnabled: info.metricsEnabled,
    hostnameForAccessKeys: info.hostnameForAccessKeys,
    portForNewAccessKeys: info.portForNewAccessKeys,
    defaultLimitBytes: info.accessKeyDataLimit?.bytes ?? null,
  };
}

function keyStatus(k: Omit<KeyView, "status">, now: number): KeyStatus {
  if (k.disabled) return "disabled";
  if (isExpired(k.expires, new Date(now))) return "expired";
  if (k.effectiveLimitBytes != null) {
    if (k.usedBytes >= k.effectiveLimitBytes) return "over-limit";
    if (k.usedBytes >= k.effectiveLimitBytes * NEAR_LIMIT_RATIO) return "near-limit";
  }
  const idle = k.lastSeenMs != null ? now - k.lastSeenMs > IDLE_AFTER_MS : k.usedBytes === 0;
  return idle ? "idle" : "active";
}

export function toKeyView(
  key: AccessKey,
  server: ServerInfo,
  usedBytes: number,
  connection?: ExperimentalMetrics["accessKeys"][number]["connection"],
  now = Date.now(),
): KeyView {
  const meta = parseKeyName(key.name ?? "");
  const limitBytes = key.dataLimit?.bytes ?? null;
  const serverLimit = server.accessKeyDataLimit?.bytes ?? null;
  const lastSeen = connection?.lastTrafficSeen;
  const view: Omit<KeyView, "status"> = {
    id: key.id,
    name: key.name ?? "",
    label: meta.label || `Key ${key.id}`,
    tags: meta.tags,
    expires: meta.expires,
    disabled: meta.disabled != null,
    dynamicHandle: meta.dynamic,
    lookupCode: meta.code,
    dynamicUrl: null,
    port: key.port,
    method: key.method,
    accessUrl: key.accessUrl,
    limitBytes,
    effectiveLimitBytes: limitBytes ?? serverLimit,
    limitSource: limitBytes != null ? "key" : serverLimit != null ? "server" : null,
    usedBytes,
    lastSeenMs: lastSeen ? lastSeen * 1000 : null,
    peakDevices: connection?.peakDeviceCount?.data ?? null,
  };
  return { ...view, status: keyStatus(view, now) };
}

/** Experimental metrics are optional: older servers return 404, newer ones may change shape. */
async function tryExperimental(client: OutlineClient): Promise<ExperimentalMetrics | null> {
  try {
    const m = await client.getExperimentalMetrics("30d");
    return m && Array.isArray(m.accessKeys) ? m : null;
  } catch {
    return null;
  }
}

function toInsights(m: ExperimentalMetrics | null): ServerInsights {
  if (!m) {
    return {
      available: false,
      tunnelSeconds: null,
      bandwidthCurrentBytes: null,
      bandwidthPeakBytes: null,
      bandwidthPeakAtMs: null,
      locations: [],
    };
  }
  const s = m.server;
  return {
    available: true,
    tunnelSeconds: s.tunnelTime?.seconds ?? null,
    bandwidthCurrentBytes: s.bandwidth?.current?.data?.bytes ?? null,
    bandwidthPeakBytes: s.bandwidth?.peak?.data?.bytes ?? null,
    bandwidthPeakAtMs: s.bandwidth?.peak?.timestamp ? s.bandwidth.peak.timestamp * 1000 : null,
    locations: (s.locations ?? [])
      .map((l) => ({
        location: l.location,
        asOrg: l.asOrg,
        bytes: l.dataTransferred?.bytes ?? 0,
        tunnelSeconds: l.tunnelTime?.seconds ?? 0,
      }))
      .sort((a, b) => b.bytes - a.bytes),
  };
}

export async function getServerKeys(
  id: string,
  client: OutlineClient,
  { withInsights = true } = {},
): Promise<Omit<ServerKeysResponse, "instance" | "dynamicKeys" | "otherServers">> {
  const [info, keys, transfer, experimental] = await Promise.all([
    client.getServer(),
    client.listAccessKeys(),
    client.getTransferMetrics(),
    withInsights ? tryExperimental(client) : Promise.resolve(null),
  ]);
  const usage = transfer.bytesTransferredByUserId ?? {};
  const connections = new Map(
    (experimental?.accessKeys ?? []).map((k) => [String(k.accessKeyId), k.connection]),
  );
  const now = Date.now();
  return {
    id,
    server: toServerView(info),
    keys: keys.map((k) => toKeyView(k, info, usage[k.id] ?? 0, connections.get(k.id), now)),
    insights: toInsights(experimental),
  };
}

async function loadKey(client: OutlineClient, keyId: string) {
  const [key, info] = await Promise.all([client.getAccessKey(keyId), client.getServer()]);
  return { key, info, meta: parseKeyName(key.name ?? "") };
}

export async function createKeys(client: OutlineClient, req: CreateKeysRequest): Promise<AccessKey[]> {
  const count = req.count ?? 1;
  if (!Number.isInteger(count) || count < 1 || count > MAX_BULK_CREATE) {
    throw new OperationError(400, `count must be between 1 and ${MAX_BULK_CREATE}`);
  }
  const created: AccessKey[] = [];
  // Sequential on purpose: keeps load on the Outline server predictable.
  for (let n = 1; n <= count; n++) {
    const label =
      count === 1 ? req.label : req.label.includes("{n}") ? req.label.replaceAll("{n}", String(n)) : `${req.label}-${n}`;
    const name = formatKeyName({
      label,
      tags: req.tags ?? [],
      expires: req.expires ?? null,
      dynamic: req.dynamic ? newDynamicHandle() : null,
      disabled: null,
      code: newLookupCode(),
    });
    created.push(
      await client.createAccessKey({
        name,
        method: req.method,
        port: req.port,
        limit: req.limitBytes != null ? { bytes: req.limitBytes } : undefined,
      }),
    );
  }
  return created;
}

export async function updateKeyMeta(
  client: OutlineClient,
  keyId: string,
  patch: Partial<Pick<KeyMeta, "label" | "tags" | "expires">>,
) {
  const { meta } = await loadKey(client, keyId);
  await client.renameAccessKey(keyId, formatKeyName({ ...meta, ...patch }));
}

export async function setKeyLimit(client: OutlineClient, keyId: string, bytes: number | null) {
  const { meta } = await loadKey(client, keyId);
  if (meta.disabled) throw new OperationError(409, "Key is disabled; enable it before changing its limit");
  if (bytes == null) await client.removeAccessKeyDataLimit(keyId);
  else await client.setAccessKeyDataLimit(keyId, bytes);
}

/** Adds `bytes` on top of the key's current effective limit. */
export async function topUpKey(client: OutlineClient, keyId: string, bytes: number) {
  const { key, info, meta } = await loadKey(client, keyId);
  if (meta.disabled) throw new OperationError(409, "Key is disabled; enable it first");
  const base = key.dataLimit?.bytes ?? info.accessKeyDataLimit?.bytes;
  if (base == null) throw new OperationError(400, "Key has no limit to top up");
  await client.setAccessKeyDataLimit(keyId, base + bytes);
}

/**
 * Outline limits apply to rolling 30-day usage and cannot be reset.
 * "Renew" grants a fresh allowance by setting limit = current usage + bytes.
 */
export async function renewKey(client: OutlineClient, keyId: string, bytes: number) {
  const [{ meta }, transfer] = await Promise.all([loadKey(client, keyId), client.getTransferMetrics()]);
  if (meta.disabled) throw new OperationError(409, "Key is disabled; enable it first");
  const used = transfer.bytesTransferredByUserId?.[keyId] ?? 0;
  await client.setAccessKeyDataLimit(keyId, used + bytes);
}

/** Soft disable: limit 0, previous limit remembered in the key name. Reversible. */
export async function disableKey(client: OutlineClient, keyId: string) {
  const { key, meta } = await loadKey(client, keyId);
  if (meta.disabled) return;
  const previousLimitBytes = key.dataLimit?.bytes ?? null;
  await client.renameAccessKey(keyId, formatKeyName({ ...meta, disabled: { previousLimitBytes } }));
  await client.setAccessKeyDataLimit(keyId, 0);
}

export async function enableKey(client: OutlineClient, keyId: string) {
  const { meta } = await loadKey(client, keyId);
  if (!meta.disabled) return;
  const previous = meta.disabled.previousLimitBytes;
  if (previous == null) await client.removeAccessKeyDataLimit(keyId);
  else await client.setAccessKeyDataLimit(keyId, previous);
  await client.renameAccessKey(keyId, formatKeyName({ ...meta, disabled: null }));
}

/** Gives the key a new lookup code (or its first one). The previous code stops working. */
export async function resetLookupCode(client: OutlineClient, keyId: string) {
  const { meta } = await loadKey(client, keyId);
  await client.renameAccessKey(keyId, formatKeyName({ ...meta, code: newLookupCode() }));
}

/**
 * Adds lookup codes to keys made before codes existed. Capped per call to stay
 * under the Workers subrequest limit; call again while `remaining` > 0.
 */
export async function addMissingLookupCodes(client: OutlineClient, max = MAX_BULK_CREATE) {
  const missing = (await client.listAccessKeys()).filter((k) => !parseKeyName(k.name ?? "").code);
  const batch = missing.slice(0, max);
  for (const k of batch) {
    await client.renameAccessKey(k.id, formatKeyName({ ...parseKeyName(k.name ?? ""), code: newLookupCode() }));
  }
  return { updated: batch.length, remaining: missing.length - batch.length };
}

/**
 * Gives the key a new dynamic handle (or its first one). Any previous dynamic
 * link for this key stops working.
 */
export async function resetDynamicHandle(client: OutlineClient, keyId: string): Promise<string> {
  const { meta } = await loadKey(client, keyId);
  const handle = newDynamicHandle();
  await client.renameAccessKey(keyId, formatKeyName({ ...meta, dynamic: handle }));
  return handle;
}

/**
 * Moves a key to another server: same name (so the same dynamic handle), method
 * and limit, on the target's default port. Usage history starts fresh there,
 * and a static ss:// link changes; a dynamic link keeps working.
 */
export async function moveKey(from: OutlineClient, to: OutlineClient, keyId: string): Promise<AccessKey> {
  const key = await from.getAccessKey(keyId);
  const created = await to.createAccessKey({ name: key.name, method: key.method, limit: key.dataLimit });
  try {
    await from.deleteAccessKey(keyId);
  } catch (err) {
    // Don't leave two live copies behind.
    await to.deleteAccessKey(created.id).catch(() => undefined);
    throw err;
  }
  return created;
}

/** Replace a (possibly leaked) key with a new one: same name, method and limit, default port. */
export async function rotateKey(client: OutlineClient, keyId: string): Promise<AccessKey> {
  const key = await client.getAccessKey(keyId);
  const created = await client.createAccessKey({
    name: key.name,
    method: key.method,
    limit: key.dataLimit,
  });
  await client.deleteAccessKey(keyId);
  return created;
}
