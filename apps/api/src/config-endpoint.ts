import { resolveDynamicKey, verifyDynamicToken } from "@outline-dash/core";
import { Hono } from "hono";
import { clientFor, dynamicKeysConfig, getServers, type Bindings } from "./env";

// Public endpoint the Outline client fetches for ssconf:// links. It sits outside
// Cloudflare Access, so it only answers GET /c/<token> with a valid signature and
// never reveals anything about the dashboard. Add a Cloudflare rate-limiting rule
// for /c/* on the config hostname (see README).

// Remembers which server holds a handle, so lookups usually hit one server.
// Cache API only works on custom domains; elsewhere every lookup scans servers.
const LOCATION_TTL_S = 300;
const locationKey = (handle: string) => new Request(`https://ssconf-location.invalid/${handle}`);

async function cachedLocation(handle: string): Promise<string | null> {
  try {
    const hit = await caches.default.match(locationKey(handle));
    return hit ? await hit.text() : null;
  } catch {
    return null;
  }
}

async function rememberLocation(handle: string, serverId: string) {
  try {
    await caches.default.put(
      locationKey(handle),
      new Response(serverId, { headers: { "cache-control": `max-age=${LOCATION_TTL_S}` } }),
    );
  } catch {
    // Best effort.
  }
}

const NO_STORE = { "cache-control": "no-store", "x-content-type-options": "nosniff" };

function fail(status: number, message: string) {
  // Outline clients show the message when they can; the shape is harmless otherwise.
  return Response.json({ error: { message } }, { status, headers: NO_STORE });
}

export const configEndpoint = new Hono<{ Bindings: Bindings }>()
  .get("/c/:token", async (c) => {
    const dyn = dynamicKeysConfig(c.env);
    if (!dyn) return fail(404, "Not found");

    const handle = await verifyDynamicToken(dyn.secret, c.req.param("token"));
    if (!handle) return fail(404, "This access key is not valid.");

    const servers = getServers(c.env).map((s) => ({ id: s.id, client: clientFor(s) }));
    const result = await resolveDynamicKey(servers, handle, await cachedLocation(handle));
    if (!result.ok) {
      const status = result.reason === "unavailable" ? 503 : result.reason === "not-found" ? 404 : 403;
      return fail(status, result.message);
    }

    c.executionCtx.waitUntil(rememberLocation(handle, result.serverId));
    return Response.json(result.config, { headers: NO_STORE });
  })
  .all("*", () => fail(404, "Not found"))
  .onError((err) => {
    console.error(err);
    return fail(503, "The server is temporarily unavailable. Try again in a few minutes.");
  });
