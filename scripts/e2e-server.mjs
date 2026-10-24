/* global process */
// Local-only test server. A fresh persistence directory avoids deleting another run's data.
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const cwd = resolve(dirname(fileURLToPath(import.meta.url)), "../apps/api");
mkdirSync(resolve(cwd, ".wrangler"), { recursive: true });
const persist = mkdtempSync(resolve(cwd, ".wrangler/e2e-"));
const runner = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const options = { cwd, stdio: "inherit", shell: process.platform === "win32" };
const quoted = (s) => process.platform === "win32" ? `"${s}"` : s;
// All command arguments below are fixed project-owned values; no user input is interpolated.
function run(args) {
  const result = spawnSync(runner, ["exec", "wrangler", ...args], options);
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
run(["d1", "migrations", "apply", "DB", "--local", "--persist-to", quoted(persist)]);
const emails = ["owner", "owner-desktop", "owner-mobile", "tester", "drafts-desktop", "drafts-mobile", "capture-desktop", "capture-mobile"];
const sql = `INSERT INTO allowlist (email, added_at) VALUES ${emails.map((e) => `('${e}@e2e.test',0)`).join(",")}`;
run(["d1", "execute", "DB", "--local", "--persist-to", quoted(persist), "--command", quoted(sql)]);
const server = spawn(runner, ["exec", "wrangler", "dev", "--local", "--persist-to", quoted(persist), "--port", "8787", "--ip", "127.0.0.1",
  "--var", "APP_ENV:test", "--var", "TEST_ID_TOKEN_VERIFIER:insecure-test-only", "--var", "GOOGLE_WEB_CLIENT_ID:e2e-client.apps.googleusercontent.com", "--var", "ALLOWED_ORIGINS:http://localhost:8787"], options);
server.on("exit", (code) => process.exit(code ?? 1));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { server.kill(signal); });
