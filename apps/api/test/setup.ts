import { env } from "cloudflare:workers";
import { applyD1Migrations } from "cloudflare:test";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const e = env as any;
await applyD1Migrations(e.DB, e.TEST_MIGRATIONS);
