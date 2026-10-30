import { zValidator } from "@hono/zod-validator";
import { getServerKeys, normalizeLookupCode, type KeyCheckView, type KeyView } from "@outline-dash/core";
import { Hono } from "hono";
import { z } from "zod";
import { clientFor, getServers, type AppEnv } from "./env";

// Public usage check: a key's user enters its lookup code (or pastes its ss://
// link) and sees that key's usage and limit. Nothing here needs sign-in, so it
// answers every miss the same way and shows only KeyCheckView fields.

const CACHE_MS = 60_000;

// Per-isolate cache of each server's keys. Lookups within a minute reuse it, so a
// busy or abusive caller can't turn this page into load on the Outline servers.
// (The Cache API would be shared, but it doesn't work on workers.dev.)
const keysByServer = new Map<string, { at: number; keys: Promise<KeyView[]> }>();

function cachedKeys(env: AppEnv["Bindings"], server: ReturnType<typeof getServers>[number]) {
  const hit = keysByServer.get(server.id);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.keys;
  const keys = getServerKeys(server.id, clientFor(server), { withInsights: false }).then((r) => r.keys);
  keysByServer.set(server.id, { at: Date.now(), keys });
  // Don't keep a failure for a whole minute.
  keys.catch(() => keysByServer.delete(server.id));
  return keys;
}

/** Matches an ss:// link by its secret part, ignoring the "#name" fragment. */
function accessUrlKey(url: string) {
  return url.trim().replace(/#.*$/, "").replace(/\/\?.*$/, "").replace(/\/$/, "");
}

const NOT_FOUND = "No key matches that code. Check it and try again.";

export const publicApi = new Hono<AppEnv>().post(
  "/check",
  zValidator("json", z.object({ code: z.string().trim().min(1).max(2000) }), (result, c) => {
    if (!result.success) return c.json({ error: NOT_FOUND }, 404);
  }),
  async (c) => {
    const ip = c.req.header("cf-connecting-ip") ?? "local";
    if (c.env.CHECK_LIMITER && !(await c.env.CHECK_LIMITER.limit({ key: `check:${ip}` })).success) {
      return c.json({ error: "Too many tries. Wait a minute and try again." }, 429);
    }

    const input = c.req.valid("json").code;
    const byUrl = input.startsWith("ss://") ? accessUrlKey(input) : null;
    const code = byUrl ? null : normalizeLookupCode(input);
    if (!byUrl && !code) return c.json({ error: NOT_FOUND }, 404);

    const results = await Promise.allSettled(getServers(c.env).map((s) => cachedKeys(c.env, s)));
    for (const r of results) {
      if (r.status !== "fulfilled") continue;
      const k = r.value.find((key) => (code ? key.lookupCode === code : accessUrlKey(key.accessUrl) === byUrl));
      if (!k) continue;
      const view: KeyCheckView = {
        label: k.label,
        status: k.status,
        usedBytes: k.usedBytes,
        limitBytes: k.effectiveLimitBytes,
        expires: k.expires,
      };
      return c.json(view);
    }
    // A server being down could be why nothing matched; say so rather than "not found".
    if (results.some((r) => r.status === "rejected")) {
      return c.json({ error: "Some servers can't be reached right now. Try again in a few minutes." }, 503);
    }
    return c.json({ error: NOT_FOUND }, 404);
  },
);
