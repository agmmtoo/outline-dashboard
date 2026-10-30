import type { InstanceRef } from "@outline-dash/core";
import { LightsailClient } from "@outline-dash/lightsail-client";
import { OutlineClient } from "@outline-dash/outline-client";
import { z } from "zod";

export interface Bindings {
  /** Secret. JSON array, see .dev.vars.example. */
  OUTLINE_SERVERS: string;
  /** Secret. Application Audience (AUD) tag of the Cloudflare Access application. */
  ACCESS_AUD?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_ALLOWED_EMAILS?: string;
  /** Secret. Hex SHA-256 of the generated admin password (password sign-in). */
  ADMIN_PASSWORD_HASH?: string;
  /** Secret. 32+ random characters; signs session cookies. */
  SESSION_SECRET?: string;
  /** Local development only; honoured only for requests to localhost. */
  DEV_ALLOW_LOCAL?: string;
  /** Secrets. Least-privilege IAM user that may only reboot tagged Lightsail instances. */
  AWS_ACCESS_KEY_ID?: string;
  AWS_SECRET_ACCESS_KEY?: string;
  /** Local development only: point Lightsail calls at a mock on localhost. */
  LIGHTSAIL_ENDPOINT_OVERRIDE?: string;
  /** Public base URL for dynamic key configs, e.g. https://outline.librarease.org */
  DYNAMIC_KEY_BASE_URL?: string;
  /** Secret. HMAC key for dynamic key tokens; rotating it invalidates every dynamic link. */
  DYNAMIC_KEY_SECRET?: string;
  /** Rate limit for the public /check lookup. Optional: lookups still work without it. */
  CHECK_LIMITER?: RateLimit;
  ASSETS: Fetcher;
}

export interface AppEnv {
  Bindings: Bindings;
  Variables: { userEmail: string };
}

const serverConfigSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, "id must be lowercase letters, digits or dashes"),
  name: z.string().optional(),
  // HTTPS only; plain HTTP is accepted for localhost so a mock server can be used in development.
  apiUrl: z.url({ protocol: /^https?$/ }).refine((u) => {
    const { protocol, hostname } = new URL(u);
    return protocol === "https:" || hostname === "localhost" || hostname === "127.0.0.1";
  }, "apiUrl must use https"),
  headers: z.record(z.string(), z.string()).optional(),
  /** Lightsail instance hosting this server, enables the reboot action. */
  lightsail: z
    .object({
      region: z.string().regex(/^[a-z]{2}(-[a-z]+)+-\d$/, "region must look like ap-southeast-1"),
      instanceName: z.string().min(1).max(255),
    })
    .optional(),
});

const serversSchema = z.array(serverConfigSchema).superRefine((list, ctx) => {
  const seen = new Set<string>();
  for (const s of list) {
    if (seen.has(s.id)) ctx.addIssue({ code: "custom", message: `Duplicate server id "${s.id}"` });
    seen.add(s.id);
  }
});

export type ServerConfig = z.infer<typeof serverConfigSchema>;

export class ConfigError extends Error {}

// Parsed once per isolate; secrets only change on redeploy.
let cached: { raw: string; servers: ServerConfig[] } | null = null;

export function getServers(env: Bindings): ServerConfig[] {
  const raw = env.OUTLINE_SERVERS ?? "";
  if (cached?.raw === raw) return cached.servers;
  let json: unknown;
  try {
    json = JSON.parse(raw || "[]");
  } catch {
    throw new ConfigError("OUTLINE_SERVERS is not valid JSON");
  }
  const parsed = serversSchema.safeParse(json);
  if (!parsed.success) {
    // Report paths and messages only; never echo values (they contain secrets).
    const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "root"}: ${i.message}`);
    throw new ConfigError(`OUTLINE_SERVERS is invalid: ${issues.join("; ")}`);
  }
  cached = { raw, servers: parsed.data };
  return parsed.data;
}

export function clientFor(server: ServerConfig) {
  return new OutlineClient({ apiUrl: server.apiUrl, headers: server.headers });
}

export function instanceRef(server: ServerConfig): InstanceRef | null {
  return server.lightsail
    ? { provider: "lightsail", region: server.lightsail.region, name: server.lightsail.instanceName }
    : null;
}

const LOCAL_ENDPOINT = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//;

/** Returns null when the server has no instance configured; throws if AWS credentials are missing. */
export function lightsailFor(env: Bindings, server: ServerConfig) {
  if (!server.lightsail) return null;
  const accessKeyId = env.AWS_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.AWS_SECRET_ACCESS_KEY?.trim();
  if (!accessKeyId || !secretAccessKey) {
    throw new ConfigError("AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY are not set");
  }
  // Only ever override to localhost, so signed requests can't be redirected elsewhere.
  const override = env.LIGHTSAIL_ENDPOINT_OVERRIDE?.trim();
  if (override && !LOCAL_ENDPOINT.test(override)) {
    throw new ConfigError("LIGHTSAIL_ENDPOINT_OVERRIDE must be an http://localhost URL");
  }
  return new LightsailClient({
    credentials: { accessKeyId, secretAccessKey },
    region: server.lightsail.region,
    endpoint: override || undefined,
  });
}

export interface DynamicKeysConfig {
  baseUrl: string;
  secret: string;
  /** Host that serves only /c/* (configs), never the dashboard. */
  host: string;
}

/** Null when dynamic keys are not configured (no DYNAMIC_KEY_SECRET). */
export function dynamicKeysConfig(env: Bindings): DynamicKeysConfig | null {
  const baseUrl = env.DYNAMIC_KEY_BASE_URL?.trim().replace(/\/+$/, "");
  const secret = env.DYNAMIC_KEY_SECRET?.trim();
  if (!secret) return null;
  if (!baseUrl) throw new ConfigError("DYNAMIC_KEY_SECRET is set but DYNAMIC_KEY_BASE_URL is not");
  if (secret.length < 32) throw new ConfigError("DYNAMIC_KEY_SECRET must be at least 32 characters");
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new ConfigError("DYNAMIC_KEY_BASE_URL is not a valid URL");
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !local) throw new ConfigError("DYNAMIC_KEY_BASE_URL must use https");
  return { baseUrl, secret, host: url.hostname };
}
