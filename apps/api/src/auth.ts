import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { AppEnv, Bindings } from "./env";

// Two ways to sign in, chosen by configuration:
// - Cloudflare Access (ACCESS_TEAM_DOMAIN + ACCESS_AUD): verify the Access JWT.
// - Password (ADMIN_PASSWORD_HASH + SESSION_SECRET): single admin password and a
//   signed, stateless session cookie. Rotating SESSION_SECRET signs everyone out.

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const SESSION_COOKIE = "session";
const SESSION_TTL_S = 12 * 3600;
const encoder = new TextEncoder();

export type AuthMode = "access" | "password" | "none";

export function authMode(env: Bindings): AuthMode {
  if (env.ACCESS_TEAM_DOMAIN?.trim() && env.ACCESS_AUD?.trim()) return "access";
  if (env.ADMIN_PASSWORD_HASH?.trim() && (env.SESSION_SECRET?.trim().length ?? 0) >= 32) return "password";
  return "none";
}

// Access

const jwksByTeam = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function jwksFor(teamDomain: string) {
  let jwks = jwksByTeam.get(teamDomain);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`));
    jwksByTeam.set(teamDomain, jwks);
  }
  return jwks;
}

async function accessEmail(env: Bindings, token: string | undefined): Promise<string | null> {
  if (!token) return null;
  const team = env.ACCESS_TEAM_DOMAIN!.trim();
  try {
    const { payload } = await jwtVerify(token, jwksFor(team), {
      issuer: `https://${team}`,
      audience: env.ACCESS_AUD!.trim(),
    });
    const email = typeof payload.email === "string" ? payload.email.toLowerCase() : null;
    const allowed = (env.ACCESS_ALLOWED_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    return email && (allowed.length === 0 || allowed.includes(email)) ? email : null;
  } catch {
    return null;
  }
}

// Password sessions

function hex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

async function hmac(secret: string, message: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  return hex(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
}

/**
 * The password is generated (high entropy), so a plain SHA-256 is enough; a slow
 * KDF would also blow the free plan's CPU limit.
 */
async function passwordMatches(env: Bindings, password: string) {
  const digest = hex(await crypto.subtle.digest("SHA-256", encoder.encode(password)));
  return safeEqual(digest, env.ADMIN_PASSWORD_HASH!.trim().toLowerCase());
}

async function newSession(env: Bindings) {
  const expires = Date.now() + SESSION_TTL_S * 1000;
  return `v1.${expires}.${await hmac(env.SESSION_SECRET!.trim(), `session:v1:${expires}`)}`;
}

async function sessionValid(env: Bindings, value: string | undefined) {
  const match = /^v1\.(\d{13})\.([0-9a-f]{64})$/.exec(value ?? "");
  if (!match || Number(match[1]) < Date.now()) return false;
  return safeEqual(match[2]!, await hmac(env.SESSION_SECRET!.trim(), `session:v1:${match[1]}`));
}

/** Blocks cross-site form posts: state-changing requests must come from this origin. */
function sameOrigin(req: Request) {
  if (req.method === "GET" || req.method === "HEAD") return true;
  const origin = req.headers.get("origin");
  return origin != null && origin === new URL(req.url).origin;
}

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const { hostname } = new URL(c.req.url);
  if (c.env.DEV_ALLOW_LOCAL === "true" && LOCAL_HOSTS.has(hostname)) {
    c.set("userEmail", "local-dev");
    return next();
  }

  const mode = authMode(c.env);
  if (mode === "none") return c.json({ error: "Authentication is not configured" }, 500);

  if (mode === "access") {
    const email = await accessEmail(c.env, c.req.header("cf-access-jwt-assertion"));
    if (!email) return c.json({ error: "Unauthorized" }, 401);
    c.set("userEmail", email);
    return next();
  }

  if (!(await sessionValid(c.env, getCookie(c, SESSION_COOKIE)))) return c.json({ error: "Unauthorized" }, 401);
  if (!sameOrigin(c.req.raw)) return c.json({ error: "Cross-origin request blocked" }, 403);
  c.set("userEmail", "admin");
  return next();
});

/** Public routes: /api/auth/* (mounted before requireAuth). */
export const auth = new Hono<AppEnv>()
  .get("/status", (c) => c.json({ mode: authMode(c.env) }))

  .post("/login", async (c) => {
    if (authMode(c.env) !== "password") return c.json({ error: "Password sign-in is not enabled" }, 400);
    if (!sameOrigin(c.req.raw)) return c.json({ error: "Cross-origin request blocked" }, 403);

    let password = "";
    try {
      const body = (await c.req.json()) as { password?: unknown };
      password = typeof body.password === "string" ? body.password : "";
    } catch {
      // Treated as a wrong password below.
    }

    if (!password || password.length > 256 || !(await passwordMatches(c.env, password))) {
      // Slow down guessing; wall-clock wait doesn't count against CPU time.
      await new Promise((r) => setTimeout(r, 1000));
      console.log(JSON.stringify({ event: "auth.login_failed", ip: c.req.header("cf-connecting-ip") ?? null }));
      return c.json({ error: "Wrong password" }, 401);
    }

    setCookie(c, SESSION_COOKIE, await newSession(c.env), {
      httpOnly: true,
      secure: true,
      sameSite: "Strict",
      path: "/",
      maxAge: SESSION_TTL_S,
    });
    console.log(JSON.stringify({ event: "auth.login", ip: c.req.header("cf-connecting-ip") ?? null }));
    return c.body(null, 204);
  })

  .post("/logout", (c) => {
    deleteCookie(c, SESSION_COOKIE, { path: "/", secure: true });
    return c.body(null, 204);
  });
