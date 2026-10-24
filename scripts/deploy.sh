#!/usr/bin/env bash
# usage: deploy.sh <staging|production>   (Cloudflare Workers Free + D1 Free only)
set -euo pipefail
cd "$(dirname "$0")/.."
ENV_NAME="${1:?usage: deploy.sh <staging|production>}"
case "$ENV_NAME" in staging|production) ;; *) echo 'deploy: environment must be staging or production' >&2; exit 1 ;; esac
[ -n "${CLOUDFLARE_API_TOKEN:-}" ] && [ -n "${CLOUDFLARE_ACCOUNT_ID:-}" ] || { echo "deploy: CLOUDFLARE_API_TOKEN/CLOUDFLARE_ACCOUNT_ID missing" >&2; exit 1; }
bash scripts/check-deploy-safety.sh "$ENV_NAME"
# Public OAuth configuration must match the backend; never build an unconfigured sign-in page.
CFG=scripts/../apps/api/wrangler.toml
export VITE_GOOGLE_WEB_CLIENT_ID="$(awk -v e="$ENV_NAME" 'e=="staging" && /^\[env\./{exit} e=="production" && /^\[env\.production/{p=1} e=="staging"||p' "$CFG" | sed -n 's/^GOOGLE_WEB_CLIENT_ID *= *"\([^"]*\)".*/\1/p' | head -1)"
pnpm build:web
bash scripts/migrate-remote.sh "$ENV_NAME"
ARGS=(); [ "$ENV_NAME" = production ] && ARGS=(--env production)
pnpm --filter @tinkerspend/api exec wrangler deploy "${ARGS[@]}"
echo "deploy: set secrets once with: pnpm --filter @tinkerspend/api exec wrangler secret put OPENAI_API_KEY ${ARGS[*]}"
