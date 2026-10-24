import type { CreatedKeyView } from "@outline-dash/core/types";
import { useEffect } from "react";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import { api, ApiError } from "./api";

export type CreatedKey = CreatedKeyView;

export type CreateBody = {
  label: string;
  tags?: string[];
  expires?: string | null;
  limitBytes?: number | null;
  port?: number;
  count?: number;
  dynamic?: boolean;
};

export type SettingsBody = {
  name?: string;
  hostname?: string;
  port?: number;
  metricsEnabled?: boolean;
  defaultLimitBytes?: number | null;
};

export type MetaBody = { label?: string; tags?: string[]; expires?: string | null };

export type Payload =
  | { intent: "create"; body: CreateBody }
  | { intent: "settings"; body: SettingsBody }
  | { intent: "meta"; keyId: string; body: MetaBody }
  | { intent: "limit"; keyId: string; bytes: number | null }
  | { intent: "top-up" | "renew"; keyId: string; bytes: number }
  | { intent: "disable" | "enable" | "rotate" | "delete" | "dynamic"; keyId: string }
  | { intent: "move"; keyId: string; to: string };

export type ActionResult =
  | { ok: true; intent: Payload["intent"]; created?: CreatedKey[] }
  | { ok: false; intent: Payload["intent"]; error: string };

const SUCCESS: Record<Payload["intent"], string> = {
  create: "Access key created",
  settings: "Settings saved",
  meta: "Details saved",
  limit: "Limit updated",
  "top-up": "Limit topped up",
  renew: "Allowance renewed",
  disable: "Key disabled",
  enable: "Key enabled",
  rotate: "Key rotated",
  delete: "Key deleted",
  dynamic: "Dynamic link updated",
  move: "Key moved",
};

/** Runs one mutation against the API worker. Used by the server route's clientAction. */
export async function runAction(sid: string, payload: Payload): Promise<ActionResult> {
  const base = `/servers/${encodeURIComponent(sid)}`;
  const key = "keyId" in payload ? `${base}/keys/${encodeURIComponent(payload.keyId)}` : "";
  try {
    switch (payload.intent) {
      case "create":
        return {
          ok: true,
          intent: payload.intent,
          created: await api<CreatedKey[]>(`${base}/keys`, { method: "POST", body: payload.body }),
        };
      case "settings":
        await api(base, { method: "PATCH", body: payload.body });
        break;
      case "meta":
        await api(key, { method: "PATCH", body: payload.body });
        break;
      case "limit":
        await api(`${key}/limit`, { method: "PUT", body: { bytes: payload.bytes } });
        break;
      case "top-up":
      case "renew":
        await api(`${key}/${payload.intent}`, { method: "POST", body: { bytes: payload.bytes } });
        break;
      case "disable":
      case "enable":
        await api(`${key}/${payload.intent}`, { method: "POST" });
        break;
      case "rotate":
        return {
          ok: true,
          intent: payload.intent,
          created: [await api<CreatedKey>(`${key}/rotate`, { method: "POST" })],
        };
      case "delete":
        await api(key, { method: "DELETE" });
        break;
      case "dynamic":
        await api(`${key}/dynamic`, { method: "POST" });
        break;
      case "move":
        return {
          ok: true,
          intent: payload.intent,
          created: [await api<CreatedKey>(`${key}/move`, { method: "POST", body: { to: payload.to } })],
        };
    }
    return { ok: true, intent: payload.intent };
  } catch (err) {
    const error = err instanceof ApiError ? err.message : "Request failed";
    return { ok: false, intent: payload.intent, error };
  }
}

/**
 * A fetcher that posts a typed JSON payload to the current route's clientAction
 * and reports the outcome as a toast.
 */
export function useAction({ silentSuccess = false } = {}) {
  const fetcher = useFetcher<ActionResult>();
  const result = fetcher.data;

  useEffect(() => {
    if (!result || fetcher.state !== "idle") return;
    if (!result.ok) toast.error(result.error);
    else if (!silentSuccess) toast.success(SUCCESS[result.intent]);
  }, [result, fetcher.state, silentSuccess]);

  return {
    fetcher,
    busy: fetcher.state !== "idle",
    result,
    submit: (payload: Payload) =>
      fetcher.submit(JSON.stringify(payload), { method: "post", encType: "text/plain" }),
  };
}

export function parseGb(value: FormDataEntryValue | null): number | null {
  const s = String(value ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}

export function splitTags(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}
