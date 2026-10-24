// Dynamic access keys: users get `ssconf://<host>/c/<handle>.<sig>` instead of a
// fixed ss:// link. The Outline client fetches the config on connect, so the
// server address, port, password or even the server itself can change without
// re-issuing links. The handle lives in the key name (see key-meta.ts); the
// signature lets the endpoint reject made-up tokens without calling any server.

import type { AccessKey, OutlineClient } from "@outline-dash/outline-client";
import { isExpired, parseKeyName } from "./key-meta";

const encoder = new TextEncoder();
const keyCache = new Map<string, Promise<CryptoKey>>();

function hmacKey(secret: string) {
  let key = keyCache.get(secret);
  if (!key) {
    key = crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
      "sign",
    ]);
    keyCache.set(secret, key);
  }
  return key;
}

function base64url(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

async function signature(secret: string, handle: string) {
  const mac = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(`ssconf:v1:${handle}`));
  // 128 bits is plenty for an unguessable token.
  return base64url(new Uint8Array(mac).slice(0, 16));
}

export async function signDynamicToken(secret: string, handle: string) {
  return `${handle}.${await signature(secret, handle)}`;
}

/** Returns the handle when the token's signature is valid, else null. */
export async function verifyDynamicToken(secret: string, token: string): Promise<string | null> {
  const match = /^([a-z2-7]{12,32})\.([A-Za-z0-9_-]{22})$/.exec(token);
  if (!match) return null;
  const [, handle, sig] = match as unknown as [string, string, string];
  const expected = await signature(secret, handle);
  // Constant-time comparison.
  let diff = expected.length ^ sig.length;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0 ? handle : null;
}

/** `https://outline.example.org` + token -> `ssconf://outline.example.org/c/<token>#Label` */
export function dynamicUrl(baseUrl: string, token: string, label: string) {
  const base = baseUrl.replace(/^https?:\/\//, "ssconf://").replace(/\/+$/, "");
  return `${base}/c/${token}#${encodeURIComponent(label)}`;
}

/** Shadowsocks config in the JSON format the Outline client accepts (client 1.8.0+). */
export interface ShadowsocksConfig {
  server: string;
  server_port: number;
  password: string;
  method: string;
}

export type DynamicResolution =
  | { ok: true; serverId: string; key: AccessKey; config: ShadowsocksConfig }
  | { ok: false; reason: "not-found" | "disabled" | "expired" | "unavailable"; message: string };

/** "ss://...@host:port/?outline=1" -> host (IPv6 brackets removed) */
function hostFromAccessUrl(accessUrl: string) {
  const match = /@(\[[^\]]+\]|[^:/?#]+):\d+/.exec(accessUrl);
  return match ? match[1]!.replace(/^\[|\]$/g, "") : null;
}

/**
 * Finds the key carrying `handle` across servers (preferred server first) and
 * builds its client config. Disabled and expired keys are refused.
 */
export async function resolveDynamicKey(
  servers: Array<{ id: string; client: OutlineClient }>,
  handle: string,
  preferredServerId?: string | null,
): Promise<DynamicResolution> {
  const ordered = [...servers].sort((a, b) => Number(b.id === preferredServerId) - Number(a.id === preferredServerId));
  let unreachable = 0;

  for (const { id, client } of ordered) {
    let keys: AccessKey[];
    try {
      keys = await client.listAccessKeys();
    } catch {
      unreachable++;
      continue;
    }
    const key = keys.find((k) => parseKeyName(k.name ?? "").dynamic === handle);
    if (!key) continue;

    const meta = parseKeyName(key.name ?? "");
    if (meta.disabled) {
      return { ok: false, reason: "disabled", message: "This access key has been disabled. Contact your administrator." };
    }
    if (isExpired(meta.expires)) {
      return { ok: false, reason: "expired", message: `This access key expired on ${meta.expires}. Contact your administrator.` };
    }
    const server = hostFromAccessUrl(key.accessUrl);
    if (!server) return { ok: false, reason: "unavailable", message: "Server address is unavailable. Try again later." };
    return {
      ok: true,
      serverId: id,
      key,
      config: { server, server_port: key.port, password: key.password, method: key.method },
    };
  }

  return unreachable > 0
    ? { ok: false, reason: "unavailable", message: "The server is temporarily unavailable. Try again in a few minutes." }
    : { ok: false, reason: "not-found", message: "This access key no longer exists." };
}
