import type { CreatedKeyView } from "@outline-dash/core/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router";
import { toast } from "sonner";
import { api, ApiError } from "./api";
import { queryKeys } from "./query";

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

/** Runs one mutation against the API worker. Failures are returned, not thrown. */
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
 * Runs a mutation for the current server route, reports the outcome as a toast and
 * refreshes only the cached data it affects. `busy` stays true until the server's
 * data has been refetched, so the UI never shows the pre-mutation state as current.
 */
export function useAction({ silentSuccess = false } = {}) {
  const { sid = "" } = useParams();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (payload: Payload) => runAction(sid, payload),
    onSuccess: async (result, payload) => {
      if (!result.ok) return void toast.error(result.error);
      if (!silentSuccess) toast.success(SUCCESS[result.intent]);
      // The overview's counts are now out of date too, but it isn't on screen: mark it
      // stale so it refetches on the next visit instead of now.
      const later = { exact: true, refetchType: "none" } as const;
      void queryClient.invalidateQueries({ queryKey: queryKeys.servers, ...later });
      if (payload.intent === "move") void queryClient.invalidateQueries({ queryKey: queryKeys.server(payload.to), ...later });
      await queryClient.invalidateQueries({ queryKey: queryKeys.server(sid), exact: true });
    },
  });

  return {
    busy: mutation.isPending,
    result: mutation.data,
    submit: (payload: Payload) => mutation.mutate(payload),
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
