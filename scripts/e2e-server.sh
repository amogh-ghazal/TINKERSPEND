#!/usr/bin/env bash
# Local-only E2E backend: fresh local D1, test identity verifier (APP_ENV=test), static client from apps/client/dist.
set -euo pipefail
cd "$(dirname "$0")/../apps/api"
PERSIST=.wrangler/e2e
rm -rf "$PERSIST"
npx wrangler d1 migrations apply DB --local --persist-to "$PERSIST" >/dev/null
npx wrangler d1 execute DB --local --persist-to "$PERSIST" --command \
  "INSERT INTO allowlist (email, added_at) VALUES ('owner@e2e.test', 0), ('owner-desktop@e2e.test', 0), ('owner-mobile@e2e.test', 0), ('tester@e2e.test', 0)" >/dev/null
exec npx wrangler dev --local --persist-to "$PERSIST" --port 8787 --ip 127.0.0.1 \
  --var APP_ENV:test --var TEST_ID_TOKEN_VERIFIER:insecure-test-only \
  --var GOOGLE_WEB_CLIENT_ID:e2e-client.apps.googleusercontent.com --var ALLOWED_ORIGINS:http://localhost:8787
