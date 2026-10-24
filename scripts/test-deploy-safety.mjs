/* global process, console */
// Read-only guard tests: no Cloudflare commands, credentials, remote DBs or deployments.
import { mkdirSync, mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
mkdirSync(resolve(root, "test-results"), { recursive: true });
const temp = mkdtempSync(resolve(root, "test-results/deploy-guard-"));
const bash = process.platform === "win32" && existsSync("C:/Program Files/Git/bin/bash.exe") ? "C:/Program Files/Git/bin/bash.exe" : "bash";
const config = `name="synthetic-guard-test"
[vars]
APP_ENV="staging"
GOOGLE_WEB_CLIENT_ID="synthetic.apps.googleusercontent.com"
ALLOWED_ORIGINS="https://synthetic.workers.dev"
[[d1_databases]]
database_id="11111111-1111-4111-8111-111111111111"
[env.production]
name="synthetic-guard-production"
[env.production.vars]
APP_ENV="production"
GOOGLE_WEB_CLIENT_ID="synthetic.apps.googleusercontent.com"
ALLOWED_ORIGINS="https://expenses.synthetic.test"
[[env.production.d1_databases]]
database_id="22222222-2222-4222-8222-222222222222"
`;
const cases = [
  ["staging", config, true], ["production", config, true], ["typo", config, false],
  ["staging", config.replaceAll("11111111-1111-4111-8111-111111111111", "00000000-0000-0000-0000-000000000000"), false],
  ["production", config.replaceAll("22222222-2222-4222-8222-222222222222", "00000000-0000-0000-0000-000000000000"), false],
  ["production", config + '\nTEST_ID_TOKEN_VERIFIER="insecure-test-only"\n', false],
  ["production", config.replace('APP_ENV="production"', 'APP_ENV="test"'), false],
  ["staging", 'usage_model="unbound"\n' + config, false],
  ["production", 'logpush=true\n' + config, false],
  ["staging", config.replace('GOOGLE_WEB_CLIENT_ID="synthetic.apps.googleusercontent.com"', 'GOOGLE_WEB_CLIENT_ID=""'), false],
  ["production", config.replace('https://expenses.synthetic.test', 'http://expenses.synthetic.test'), false],
  ["production", config.replace('https://expenses.synthetic.test', 'https://expenses.synthetic.test,http://unsafe.test'), false],
];
for (const [i, [environment, text, allowed]] of cases.entries()) {
  const path = resolve(temp, `case-${i}.toml`);
  writeFileSync(path, text);
  const result = spawnSync(bash, [resolve(root, "scripts/check-deploy-safety.sh").replaceAll("\\", "/"), environment], { encoding: "utf8", env: { ...process.env, TS_DEPLOY_CONFIG_PATH: path.replaceAll("\\", "/") } });
  if (result.error) throw result.error;
  assert.equal(result.status === 0, allowed, `case ${i}: ${result.stderr || result.stdout}`);
}
console.log(`${cases.length}/${cases.length} deployment guard cases passed; no network or deployment performed.`);
