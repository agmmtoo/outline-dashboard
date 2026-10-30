import { OperationError } from "@outline-dash/core";
import { LightsailError } from "@outline-dash/lightsail-client";
import { OutlineApiError } from "@outline-dash/outline-client";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";
import { auth, authMode, requireAuth } from "./auth";
import { configEndpoint } from "./config-endpoint";
import { ConfigError, type AppEnv, type Bindings } from "./env";
import { instance, lightsailErrorResponse } from "./instance";
import { publicApi } from "./public";
import { servers } from "./servers";

const app = new Hono<AppEnv>().basePath("/api");

app.use(secureHeaders());
app.use(async (c, next) => {
  await next();
  // Responses carry access keys; never let a browser or proxy cache them.
  c.header("cache-control", "no-store");
});
app.route("/auth", auth);
// The key usage check is for key holders, not admins, so it sits before sign-in.
app.route("/public", publicApi);
app.use(requireAuth);

app.get("/me", (c) => c.json({ email: c.get("userEmail"), mode: authMode(c.env) }));
app.route("/servers", servers);
app.route("/servers", instance);

app.notFound((c) => c.json({ error: "Not found" }, 404));

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  if (err instanceof OperationError) return c.json({ error: err.message }, err.status);
  if (err instanceof ConfigError) return c.json({ error: err.message }, 500);
  if (err instanceof LightsailError) {
    const { status, error } = lightsailErrorResponse(err);
    return c.json({ error }, status);
  }
  if (err instanceof OutlineApiError) {
    // Pass through client errors from Outline; anything else is a bad gateway.
    const status = err.status === 400 || err.status === 404 || err.status === 409 ? err.status : 502;
    return c.json({ error: `Outline: ${err.message}` }, status);
  }
  console.error(err);
  return c.json({ error: "Internal error" }, 500);
});

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

function configOnlyHost(env: Bindings) {
  try {
    const host = env.DYNAMIC_KEY_BASE_URL ? new URL(env.DYNAMIC_KEY_BASE_URL).hostname : null;
    // Locally the dashboard and configs share one origin.
    return host && !LOCAL_HOSTS.has(host) ? host : null;
  } catch {
    return null;
  }
}

export default {
  fetch(request, env, ctx) {
    const url = new URL(request.url);
    // Public dynamic key configs (outside Cloudflare Access).
    if (url.pathname.startsWith("/c/")) return configEndpoint.fetch(request, env, ctx);
    // The config hostname serves nothing else, so it doesn't reveal the dashboard.
    if (url.hostname === configOnlyHost(env)) return new Response("Not found", { status: 404 });
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return app.fetch(request, env, ctx);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Bindings>;
