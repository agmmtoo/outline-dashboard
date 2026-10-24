# Outline Admin

Single-user admin dashboard for self-hosted [Outline](https://getoutline.org) VPN servers. It creates, tops up, disables, rotates and monitors access keys across several servers. It runs on the Cloudflare free tier and has no database.

```
Browser (React Router SPA) ──/api/*──▶ Hono Worker ──HTTPS──▶ Outline management API (per server)
```

- The Worker serves the static SPA build and the `/api/*` routes from one origin, so there is no CORS setup and one Cloudflare Access application protects both.
- Data is fetched live from Outline whenever a page is opened or refreshed. Nothing is stored.
- Server `apiUrl`s (which embed the admin secret) live only in a Worker secret. They are never sent to the browser.

## Layout

| Path | What |
| --- | --- |
| `apps/web` | React Router 8 in SPA mode (`ssr: false`), shadcn/ui (preset `b2CRGCrKK`, Base UI) + Tailwind 4 |
| `apps/api` | Hono Worker: `/api/*`, Access JWT check, serves `apps/web/build/client` |
| `packages/outline-client` | Typed client for the Outline Server Management API |
| `packages/lightsail-client` | Minimal SigV4 Lightsail client (`GetInstanceState`, `RebootInstance`) |
| `infra/terraform/lightsail-reboot-iam` | Least-privilege IAM user for the reboot button |
| `packages/core` | Key-name metadata, status rules, key operations (top-up, renew, disable, rotate), shared DTOs |

The Telegram bot (planned) will be another route group in `apps/api` that calls the same `@outline-dash/core` operations.

## Key name conventions

Outline has no fields for owner, expiry or an on/off switch, so the dashboard stores that information in the key name:

```
Aung | plus | exp:2026-12-31 | off:50000000000
```

- The first segment is the label.
- `dyn:` is the dynamic link handle (see [Dynamic access keys](#dynamic-access-keys-ssconf)).
- `exp:` is the expiry date (inclusive). Expired keys are flagged; they are not disabled automatically yet.
- `off:` marks a soft-disabled key (limit set to 0). Its value is the limit to restore on enable.
- Any other segment is a tag.

Keys edited in the Outline Manager keep working; names without segments are treated as plain labels.

## Key actions

| Action | Outline calls |
| --- | --- |
| Top up +N GB | per-key limit = current effective limit + N |
| Renew N GB | per-key limit = 30-day usage + N (Outline cannot reset usage; limits apply to a rolling 30-day window) |
| Set / remove limit | `PUT` / `DELETE /access-keys/{id}/data-limit` |
| Disable / enable | limit 0 plus `off:` name marker; enable restores the previous limit |
| Rotate | create a key with the same name, method and limit on the default port, then delete the old one |
| Delete | `DELETE /access-keys/{id}` |

## Sign-in

Two modes, picked by which secrets are set:

- **Password (current deployment):** `ADMIN_PASSWORD_HASH` (SHA-256 of a generated password) and `SESSION_SECRET` (32+ random characters). Run `apps/api/scripts/set-admin-password.sh` to create or rotate the password; it prints the password once. Sessions are signed, `HttpOnly`, `Secure`, `SameSite=Strict` cookies that last 12 hours. Changes must come from the same origin. A failed login waits 1 second and is logged as `auth.login_failed`. Rotating `SESSION_SECRET` signs everyone out.
- **Cloudflare Access:** set `ACCESS_TEAM_DOMAIN` and the `ACCESS_AUD` secret. This takes precedence over the password.

With neither set, the API refuses every request.

## Dynamic access keys (ssconf://)

A dynamic key gives the user a link like `ssconf://outline.librarease.org/c/<token>#Name` instead of a fixed `ss://` link. The Outline app (1.8 or newer) fetches the server address, port, password and cipher from that URL every time it connects. You can then rotate the key, move it to another server, or change the server's IP, hostname or port, and users keep the same link.

How it works, without a database:

- Each dynamic key carries a random handle in its name (`dyn:<handle>`). Rotate and move copy the name, so the handle, and therefore the link, follows the key.
- The token is `<handle>.<signature>`, an HMAC with `DYNAMIC_KEY_SECRET`. Forged tokens are rejected before any Outline server is called. Rotating the secret invalidates every dynamic link at once.
- `GET /c/<token>` finds the server holding the handle and returns the Shadowsocks config as JSON. It remembers that server for 5 minutes (Cache API) so most lookups hit one server.
- Disabled keys and keys past their `exp:` date get an error instead of a config, so expiry is enforced for dynamic keys.

Setup:

1. Attach `outline.librarease.org` to the Worker as a **custom domain**. Use a different hostname for the dashboard (behind Access). The config host only answers `/c/*`; everything else on it is a 404.
2. Do **not** put the config host behind Cloudflare Access. The Outline app can't log in.
3. Run `openssl rand -base64 48 | npx wrangler secret put DYNAMIC_KEY_SECRET` from `apps/api`. `DYNAMIC_KEY_BASE_URL` is already set in `wrangler.jsonc`.
4. Add a WAF **rate limiting rule** on the config host (the free plan includes one), for example 30 requests per 10 seconds per IP on `/c/`.
5. In the dashboard, create new keys with **Dynamic link** on, or use **Create dynamic link** on existing keys and hand out the new link once.

Things to know:

- **Domain blocking:** if the config domain gets blocked where your users are, they can't fetch new configs. Keep it low-profile and unrelated to the dashboard.
- **Treat the link as a password:** a dynamic link gives anyone who holds it the key's password. Workers Logs record request paths, so tokens appear there. Logs are only visible to your Cloudflare account.
- **Move resets usage:** moving a key starts its 30-day usage from zero on the new server.

## Rebooting a Lightsail instance

If an Outline server hangs, the dashboard can reboot the Lightsail instance behind it. The **Reboot** button appears on the overview card, including the card of an unreachable server, and in the server page header.

1. Add `"lightsail": {"region": "ap-southeast-1", "instanceName": "<name>"}` to that server's entry in `OUTLINE_SERVERS`.
2. Apply [`infra/terraform/lightsail-reboot-iam`](infra/terraform/lightsail-reboot-iam/README.md). It creates an IAM user that can only reboot instances tagged `outline-dashboard=reboot` and read instance state.
3. Tag the instance, create an access key, and store it with `wrangler secret put AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`.

Each reboot asks for confirmation and is logged to Workers logs as `instance.reboot`, with the signed-in email. After a reboot the page polls the instance state every 5 seconds until it is running again, then refreshes.

## Local development

```bash
pnpm install
cp apps/api/.dev.vars.example apps/api/.dev.vars   # then fill in OUTLINE_SERVERS
pnpm dev
```

`pnpm dev` starts the Worker on :8787 and Vite on :5173 (which proxies `/api` to the Worker). Open http://localhost:5173.

`DEV_ALLOW_LOCAL=true` skips Access verification, but only for requests to `localhost` or `127.0.0.1`. It has no effect on a deployed hostname. Plain `http://` server URLs are also accepted only for localhost (for a mock server).

Other scripts: `pnpm typecheck`, `pnpm build`.

## Deploy (Cloudflare free tier)

1. **Put Caddy in front of each Outline server.** Workers cannot trust Outline's self-signed certificate on a raw IP, so Caddy serves the management API on a real hostname with a Let's Encrypt certificate and forwards to Outline, verifying Outline's own certificate. The Outline API port stays open for Outline Manager.
   1. Add a **DNS only** (grey cloud) `A` record, e.g. `ol-sg1.<your-domain>` -> server IP. Open TCP 80 and 443 in the server firewall.
   2. Re-issue Outline's certificate with a SAN (Go-based proxies reject Outline's CN-only certificate), then restart it. Re-add the server in Outline Manager afterwards, since `certSha256` changes:
      ```bash
      cd /opt/outline/persisted-state
      sudo cp shadowbox-selfsigned.crt crt.bak && sudo cp shadowbox-selfsigned.key key.bak
      sudo openssl req -x509 -nodes -days 3650 -newkey rsa:2048 -subj "/CN=<IP>" \
        -addext "subjectAltName=IP:<IP>,DNS:localhost" \
        -keyout shadowbox-selfsigned.key -out shadowbox-selfsigned.crt
      sudo docker restart shadowbox
      sudo install -m 644 shadowbox-selfsigned.crt /etc/caddy/outline.crt
      ```
   3. `/etc/caddy/Caddyfile` (requests without the shared token get 403):
      ```
      ol-sg1.<your-domain> {
      	@authorized header X-Proxy-Token {$PROXY_TOKEN}
      	handle @authorized {
      		reverse_proxy https://localhost:<API_PORT> {
      			header_up -X-Proxy-Token
      			transport http {
      				tls_trust_pool file /etc/caddy/outline.crt
      				tls_server_name localhost
      			}
      		}
      	}
      	respond 403
      }
      ```
      Set `PROXY_TOKEN` (generate with `openssl rand -hex 32`) via `sudo systemctl edit caddy` -> `[Service]` / `Environment=PROXY_TOKEN=...`, then `sudo systemctl restart caddy`.
2. **Protect the dashboard.** Create an Access application for the dashboard hostname, with a policy that allows only your email. Copy its **Application Audience (AUD) tag**.
3. **Configure the Worker.** In `apps/api/wrangler.jsonc`:
   - set `ACCESS_TEAM_DOMAIN` (for example `yourteam.cloudflareaccess.com`),
   - optionally set `ACCESS_ALLOWED_EMAILS`,
   - add a custom domain (`routes`) for the dashboard.
4. **Add secrets.**
   ```bash
   cd apps/api
   npx wrangler secret put ACCESS_AUD
   npx wrangler secret put OUTLINE_SERVERS
   ```
   `OUTLINE_SERVERS` is a JSON array:
   ```json
   [{ "id": "sg1", "name": "Singapore 1", "apiUrl": "https://ol-sg1.<your-domain>/<secret>",
      "headers": { "X-Proxy-Token": "<PROXY_TOKEN>" } }]
   ```
5. **Build and deploy.** From the repo root, run `pnpm run deploy`. Use `run`: plain `pnpm deploy` is a different, built-in pnpm command.

## Limits and caveats

- **Server count:** the free Workers plan allows 50 subrequests per request. The overview makes 3 calls per server, so stay under about 15 servers, or move to the paid plan. Bulk create is capped at 40 keys per request.
- **Experimental metrics:** last seen, peak devices, bandwidth and locations come from `/experimental/server/metrics`, which Outline may change. When it is unavailable those columns show `-` and everything else keeps working.
- **Personal data:** usage, location and last-seen data tied to named people is personal data. Check with Legal or the Data Protection lead before using this for staff or customer keys.
