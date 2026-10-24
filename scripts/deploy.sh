#!/usr/bin/env bash
# usage: deploy.sh <staging|production>   (Cloudflare Workers Free + D1 Free only)
set -euo pipefail
cd "$(dirname "$0")/.."
ENV_NAME="${1:?usage: deploy.sh <staging|production>}"
[ -n "${CLOUDFLARE_API_TOKEN:-}" ] && [ -n "${CLOUDFLARE_ACCOUNT_ID:-}" ] || { echo "deploy: CLOUDFLARE_API_TOKEN/CLOUDFLARE_ACCOUNT_ID missing" >&2; exit 1; }
bash scripts/check-deploy-safety.sh "$ENV_NAME"
pnpm build:web
bash scripts/migrate-remote.sh "$ENV_NAME"
ARGS=(); [ "$ENV_NAME" = production ] && ARGS=(--env production)
pnpm --filter @tinkerspend/api exec wrangler deploy "${ARGS[@]}"
echo "deploy: set secrets once with: pnpm --filter @tinkerspend/api exec wrangler secret put OPENAI_API_KEY ${ARGS[*]}"
