#!/usr/bin/env bash
# Refuses deployment if test-only auth or placeholder resources would reach a deployed Worker.
set -euo pipefail
ENV_NAME="${1:?usage: check-deploy-safety.sh <staging|production>}"
CFG="${TS_DEPLOY_CONFIG_PATH:-$(dirname "$0")/../apps/api/wrangler.toml}"
fail() { echo "deploy-safety: $*" >&2; exit 1; }
case "$ENV_NAME" in staging|production) ;; *) fail "environment must be staging or production" ;; esac
[ -f "$CFG" ] || fail "configuration file missing"
grep -Eq 'TEST_ID_TOKEN_VERIFIER|APP_ENV *= *"test"' "$CFG" && fail "test-only auth configured in wrangler.toml"
grep -q '00000000-0000-0000-0000-000000000000' <(awk -v e="$ENV_NAME" 'e=="staging" && /^\[env\./{exit} e=="production" && /^\[env\.production/{p=1} e=="staging"||p' "$CFG") && fail "placeholder D1 database_id for $ENV_NAME"
grep -Eq 'usage_model *= *"(standard|unbound)"|\[\[r2_buckets\]\]|\[\[queues|logpush *= *true|\[\[vectorize' "$CFG" && fail "unapproved metered feature configured"
scope="$(awk -v e="$ENV_NAME" 'e=="staging" && /^\[env\./{exit} e=="production" && /^\[env\.production/{p=1} e=="staging"||p' "$CFG")"
grep -Eq '^GOOGLE_WEB_CLIENT_ID *= *"[A-Za-z0-9._-]+\.apps\.googleusercontent\.com"' <<<"$scope" || fail "Google client ID is not configured for $ENV_NAME"
origin_re='https://[A-Za-z0-9.-]+(:[0-9]+)?'
grep -Eq "^ALLOWED_ORIGINS *= *\"${origin_re}(,${origin_re})*\"" <<<"$scope" || fail "explicit HTTPS origins required for $ENV_NAME"
echo "deploy-safety: ok ($ENV_NAME)"
