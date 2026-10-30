import type { CreatedKeyView, KeyView } from "@outline-dash/core/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useParams } from "react-router";
import { toast } from "sonner";
import { api, ApiError } from "./api";
import { pendingActions } from "./pending";
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
  | { intent: "move"; keyId: string; to: string }
  | { intent: "code"; keyId: string }
  | { intent: "codes" };

export type ActionResult =
  | { ok: true; intent: Payload["intent"]; created?: CreatedKey[]; codes?: { updated: number; remaining: number } }
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
  code: "New check code issued",
  codes: "Check codes added",
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
      case "code":
        await api(`${key}/code`, { method: "POST" });
        break;
      case "codes":
        return {
          ok: true,
          intent: payload.intent,
          codes: await api<{ updated: number; remaining: number }>(`${base}/lookup-codes`, { method: "POST" }),
        };
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
 * The change that puts a key back the way `k` shows it, for actions that only set
 * values (limit, name, enabled). Null for actions that can't be undone.
 */
export function inverseOf(payload: Payload, k: KeyView): Payload | null {
  switch (payload.intent) {
    case "limit":
    case "top-up":
    case "renew":
      // A null per-key limit means the key was on the server default; removing it restores that.
      return { intent: "limit", keyId: k.id, bytes: k.limitBytes };
    case "meta":
      return { intent: "meta", keyId: k.id, body: { label: k.label, tags: k.tags, expires: k.expires } };
    case "disable":
      return { intent: "enable", keyId: k.id };
    case "enable":
      return { intent: "disable", keyId: k.id };
    default:
      return null;
  }
}

type SubmitOptions = {
  /** Offered as "Undo" on the success toast. */
  undo?: Payload | null;
  /** Wait GRACE_MS before sending, with a cancel bar showing this title. */
  grace?: { title: string; keyId?: string };
};

type Variables = { payload: Payload; undo?: Payload | null; undoing?: boolean };

/**
 * Runs a mutation for the current server route, reports the outcome as a toast and
 * refreshes only the cached data it affects. `busy` stays true until the server's
 * data has been refetched, so the UI never shows the pre-mutation state as current.
 *
 * Changes that only set values get an Undo button on their toast. Changes that
 * can't be undone are held back for a few seconds so they can be cancelled; leaving
 * the page cancels them too, since their result (e.g. a new link) would be lost.
 */
export function useAction({ silentSuccess = false } = {}) {
  const { sid = "" } = useParams();
  const queryClient = useQueryClient();
  const scheduled = useRef(new Set<number>());

  const mutation = useMutation({
    mutationFn: ({ payload }: Variables) => runAction(sid, payload),
    onSuccess: async (result, { payload, undo, undoing }) => {
      if (!result.ok) return void toast.error(undoing ? `Undo failed: ${result.error}` : result.error);
      if (undoing) toast.success("Change undone");
      else if (!silentSuccess || undo) {
        toast.success(SUCCESS[result.intent], {
          duration: undo ? 10_000 : undefined,
          action: undo ? { label: "Undo", onClick: () => mutation.mutate({ payload: undo, undoing: true }) } : undefined,
        });
      }
      // The overview's counts are now out of date too, but it isn't on screen: mark it
      // stale so it refetches on the next visit instead of now.
      const later = { exact: true, refetchType: "none" } as const;
      void queryClient.invalidateQueries({ queryKey: queryKeys.servers, ...later });
      if (payload.intent === "move") void queryClient.invalidateQueries({ queryKey: queryKeys.server(payload.to), ...later });
      await queryClient.invalidateQueries({ queryKey: queryKeys.server(sid), exact: true });
    },
  });

  useEffect(() => {
    const ids = scheduled.current;
    return () => {
      for (const id of ids) {
        if (pendingActions.cancel(id)) toast.info("A waiting change was cancelled because you left the page");
      }
    };
  }, []);

  return {
    busy: mutation.isPending,
    result: mutation.data,
    submit: (payload: Payload, { undo, grace }: SubmitOptions = {}) => {
      if (!grace) return mutation.mutate({ payload, undo });
      const id = pendingActions.schedule({
        ...grace,
        run: () => {
          scheduled.current.delete(id);
          mutation.mutate({ payload });
        },
      });
      scheduled.current.add(id);
    },
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
