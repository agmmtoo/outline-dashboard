import { zValidator } from "@hono/zod-validator";
import {
  createKeys,
  disableKey,
  enableKey,
  dynamicUrl,
  getServerKeys,
  MAX_BULK_CREATE,
  moveKey,
  parseKeyName,
  renewKey,
  resetDynamicHandle,
  rotateKey,
  signDynamicToken,
  setKeyLimit,
  topUpKey,
  updateKeyMeta,
  type CreatedKeyView,
  type KeyStatus,
  type ServerKeysResponse,
  type ServerSummary,
} from "@outline-dash/core";
import type { AccessKey } from "@outline-dash/outline-client";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { clientFor, dynamicKeysConfig, getServers, instanceRef, type AppEnv } from "./env";

const bytes = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");
const label = z.string().trim().min(1).max(100);
const tags = z.array(z.string().trim().min(1).max(40)).max(10);

// zValidator with a readable { error } body instead of the raw ZodError.
const json = <T extends z.ZodType>(schema: T) =>
  zValidator("json", schema, (result, c) => {
    if (!result.success) {
      const error = result.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ");
      return c.json({ error }, 400);
    }
  });

const STATUSES: KeyStatus[] = ["active", "near-limit", "over-limit", "idle", "expired", "disabled"];

export function serverOr404(env: AppEnv["Bindings"], id: string) {
  const server = getServers(env).find((s) => s.id === id);
  if (!server) throw new HTTPException(404, { message: `Unknown server "${id}"` });
  return { server, client: clientFor(server) };
}

/** ssconf:// link for a key name carrying a dynamic handle, when dynamic keys are configured. */
async function linkFor(env: AppEnv["Bindings"], name: string) {
  const dyn = dynamicKeysConfig(env);
  const meta = parseKeyName(name);
  if (!dyn || !meta.dynamic) return null;
  return dynamicUrl(dyn.baseUrl, await signDynamicToken(dyn.secret, meta.dynamic), meta.label);
}

async function createdView(env: AppEnv["Bindings"], k: AccessKey): Promise<CreatedKeyView> {
  return { id: k.id, name: k.name, accessUrl: k.accessUrl, dynamicUrl: await linkFor(env, k.name ?? "") };
}

function requireDynamic(env: AppEnv["Bindings"]) {
  if (!dynamicKeysConfig(env)) {
    throw new HTTPException(409, { message: "Dynamic keys are not configured (DYNAMIC_KEY_BASE_URL / DYNAMIC_KEY_SECRET)" });
  }
}

export const servers = new Hono<AppEnv>()
  .get("/", async (c) => {
    const configured = getServers(c.env);
    const results = await Promise.allSettled(
      configured.map((s) => getServerKeys(s.id, clientFor(s), { withInsights: false })),
    );
    const summaries: ServerSummary[] = results.map((r, i) => {
      const cfg = configured[i]!;
      if (r.status === "rejected") {
        const error = r.reason instanceof Error ? r.reason.message : "Unknown error";
        return { id: cfg.id, ok: false, label: cfg.name ?? cfg.id, error, instance: instanceRef(cfg) };
      }
      const statusCounts = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<KeyStatus, number>;
      for (const k of r.value.keys) statusCounts[k.status]++;
      return {
        id: cfg.id,
        ok: true,
        instance: instanceRef(cfg),
        server: r.value.server,
        keyCount: r.value.keys.length,
        usedBytes: r.value.keys.reduce((sum, k) => sum + k.usedBytes, 0),
        statusCounts,
        // Already loaded for the counts above, so this costs no extra Outline calls.
        keys: r.value.keys.map(({ id, label, usedBytes, effectiveLimitBytes, status, lastSeenMs }) => ({
          id,
          label,
          usedBytes,
          effectiveLimitBytes,
          status,
          lastSeenMs,
        })),
      };
    });
    return c.json(summaries);
  })

  .get("/:sid", async (c) => {
    const { server, client } = serverOr404(c.env, c.req.param("sid"));
    const data = await getServerKeys(server.id, client);
    const keys = await Promise.all(data.keys.map(async (k) => ({ ...k, dynamicUrl: await linkFor(c.env, k.name) })));
    const response: ServerKeysResponse = {
      ...data,
      keys,
      instance: instanceRef(server),
      dynamicKeys: dynamicKeysConfig(c.env) != null,
      otherServers: getServers(c.env)
        .filter((s) => s.id !== server.id)
        .map((s) => ({ id: s.id, name: s.name ?? s.id })),
    };
    return c.json(response);
  })

  .patch(
    "/:sid",
    json(
      z.object({
        name: z.string().trim().min(1).max(100).optional(),
        hostname: z.string().trim().min(1).max(253).optional(),
        port: z.number().int().min(1).max(65535).optional(),
        metricsEnabled: z.boolean().optional(),
        defaultLimitBytes: bytes.nullable().optional(),
      }),
    ),
    async (c) => {
      const { client } = serverOr404(c.env, c.req.param("sid"));
      const body = c.req.valid("json");
      if (body.name !== undefined) await client.renameServer(body.name);
      if (body.hostname !== undefined) await client.setHostnameForAccessKeys(body.hostname);
      if (body.port !== undefined) await client.setPortForNewAccessKeys(body.port);
      if (body.metricsEnabled !== undefined) await client.setMetricsEnabled(body.metricsEnabled);
      if (body.defaultLimitBytes === null) await client.removeServerDataLimit();
      else if (body.defaultLimitBytes !== undefined) await client.setServerDataLimit(body.defaultLimitBytes);
      return c.body(null, 204);
    },
  )

  .post(
    "/:sid/keys",
    json(
      z.object({
        label,
        tags: tags.optional(),
        expires: isoDate.nullable().optional(),
        limitBytes: bytes.nullable().optional(),
        port: z.number().int().min(1).max(65535).optional(),
        method: z.string().max(40).optional(),
        count: z.number().int().min(1).max(MAX_BULK_CREATE).optional(),
        dynamic: z.boolean().optional(),
      }),
    ),
    async (c) => {
      const { client } = serverOr404(c.env, c.req.param("sid"));
      const body = c.req.valid("json");
      if (body.dynamic) requireDynamic(c.env);
      const created = await createKeys(client, body);
      return c.json(await Promise.all(created.map((k) => createdView(c.env, k))), 201);
    },
  )

  .patch(
    "/:sid/keys/:kid",
    json(z.object({ label: label.optional(), tags: tags.optional(), expires: isoDate.nullable().optional() })),
    async (c) => {
      const { client } = serverOr404(c.env, c.req.param("sid"));
      await updateKeyMeta(client, c.req.param("kid"), c.req.valid("json"));
      return c.body(null, 204);
    },
  )

  .put("/:sid/keys/:kid/limit", json(z.object({ bytes: bytes.nullable() })), async (c) => {
    const { client } = serverOr404(c.env, c.req.param("sid"));
    await setKeyLimit(client, c.req.param("kid"), c.req.valid("json").bytes);
    return c.body(null, 204);
  })

  .post("/:sid/keys/:kid/top-up", json(z.object({ bytes: bytes.min(1) })), async (c) => {
    const { client } = serverOr404(c.env, c.req.param("sid"));
    await topUpKey(client, c.req.param("kid"), c.req.valid("json").bytes);
    return c.body(null, 204);
  })

  .post("/:sid/keys/:kid/renew", json(z.object({ bytes: bytes.min(1) })), async (c) => {
    const { client } = serverOr404(c.env, c.req.param("sid"));
    await renewKey(client, c.req.param("kid"), c.req.valid("json").bytes);
    return c.body(null, 204);
  })

  .post("/:sid/keys/:kid/disable", async (c) => {
    const { client } = serverOr404(c.env, c.req.param("sid"));
    await disableKey(client, c.req.param("kid"));
    return c.body(null, 204);
  })

  .post("/:sid/keys/:kid/enable", async (c) => {
    const { client } = serverOr404(c.env, c.req.param("sid"));
    await enableKey(client, c.req.param("kid"));
    return c.body(null, 204);
  })

  .post("/:sid/keys/:kid/rotate", async (c) => {
    const { client } = serverOr404(c.env, c.req.param("sid"));
    const key = await rotateKey(client, c.req.param("kid"));
    return c.json(await createdView(c.env, key), 201);
  })

  .post("/:sid/keys/:kid/dynamic", async (c) => {
    requireDynamic(c.env);
    const { client } = serverOr404(c.env, c.req.param("sid"));
    await resetDynamicHandle(client, c.req.param("kid"));
    return c.body(null, 204);
  })

  .post("/:sid/keys/:kid/move", json(z.object({ to: z.string().min(1) })), async (c) => {
    const { server, client } = serverOr404(c.env, c.req.param("sid"));
    const target = serverOr404(c.env, c.req.valid("json").to);
    if (target.server.id === server.id) throw new HTTPException(400, { message: "Key is already on that server" });
    const key = await moveKey(client, target.client, c.req.param("kid"));
    return c.json({ ...(await createdView(c.env, key)), serverId: target.server.id }, 201);
  })

  .delete("/:sid/keys/:kid", async (c) => {
    const { client } = serverOr404(c.env, c.req.param("sid"));
    await client.deleteAccessKey(c.req.param("kid"));
    return c.body(null, 204);
  });
