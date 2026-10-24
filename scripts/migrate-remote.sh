#!/usr/bin/env bash
# usage: migrate-remote.sh <staging|production>  — applies D1 migrations to the remote database.
set -euo pipefail
cd "$(dirname "$0")/.."
ENV_NAME="${1:?usage: migrate-remote.sh <staging|production>}"
bash scripts/check-deploy-safety.sh "$ENV_NAME"
ARGS=(); [ "$ENV_NAME" = production ] && ARGS=(--env production)
pnpm --filter @tinkerspend/api exec wrangler d1 migrations apply DB --remote "${ARGS[@]}"
