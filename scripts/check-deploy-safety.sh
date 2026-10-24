#!/usr/bin/env bash
# Refuses deployment if test-only auth or placeholder resources would reach a deployed Worker.
set -euo pipefail
ENV_NAME="${1:?usage: check-deploy-safety.sh <staging|production>}"
CFG="$(dirname "$0")/../apps/api/wrangler.toml"
fail() { echo "deploy-safety: $*" >&2; exit 1; }
grep -Eq 'TEST_ID_TOKEN_VERIFIER|APP_ENV *= *"test"' "$CFG" && fail "test-only auth configured in wrangler.toml"
grep -q '00000000-0000-0000-0000-000000000000' <(awk -v e="$ENV_NAME" 'e=="staging" && /^\[env\./{exit} e=="production" && /^\[env\.production/{p=1} e=="staging"||p' "$CFG") && fail "placeholder D1 database_id for $ENV_NAME"
grep -Eq 'usage_model *= *"(standard|unbound)"|\[\[r2_buckets\]\]|\[\[queues' "$CFG" && fail "paid-only feature configured"
echo "deploy-safety: ok ($ENV_NAME)"
