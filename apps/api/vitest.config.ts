import { defineConfig } from "vitest/config";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";

export default defineConfig(async () => {
  const migrations = await readD1Migrations("./migrations");
  return {
    plugins: [
      cloudflareTest({
        main: "./src/index.ts",
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: {
          bindings: { APP_ENV: "test", TEST_ID_TOKEN_VERIFIER: "insecure-test-only", GOOGLE_WEB_CLIENT_ID: "test-client.apps.googleusercontent.com", OPENAI_API_KEY: "sk-test-not-a-real-key", TEST_MIGRATIONS: migrations },
        },
      }),
    ],
    test: { setupFiles: ["./test/setup.ts"], include: ["test/**/*.test.ts"], maxWorkers: 2 },
  };
});
