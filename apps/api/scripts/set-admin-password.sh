#!/usr/bin/env bash
# Generates a new random admin password, stores only its SHA-256 hash as the
# ADMIN_PASSWORD_HASH Worker secret, and prints the password once. Save it in a
# password manager. Re-run to rotate; to also sign out existing sessions, rotate
# SESSION_SECRET too (openssl rand -hex 32 | npx wrangler secret put SESSION_SECRET).
set -euo pipefail
cd "$(dirname "$0")/.."

password="$(openssl rand -base64 24)"
printf '%s' "$password" | shasum -a 256 | cut -d' ' -f1 | npx wrangler secret put ADMIN_PASSWORD_HASH

printf '\nAdmin password (shown once, save it now):\n\n  %s\n\n' "$password"
