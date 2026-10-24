import { describe, expect, it } from "vitest";
import { verifyGoogleIdToken } from "../src/auth";
import { call, E, idToken, loginAndroid } from "./helpers";

describe("deployment authentication boundaries", () => {
  it("does not enable the fake identity verifier in production even if the test binding leaks into config", async () => {
    await expect(verifyGoogleIdToken({ ...E, APP_ENV: "production", TEST_ID_TOKEN_VERIFIER: "insecure-test-only" }, idToken({ sub: "synthetic", email: "synthetic@e2e.test", nonce: "synthetic" })))
      .rejects.toMatchObject({ status: 401, code: "unauthenticated" });
  });
  it("refuses native bearer sessions presented as browser cookies", async () => {
    const a = await loginAndroid("native-cookie-test", "native-cookie@e2e.test");
    expect((await call("GET", "/api/v1/me", { token: a.token })).status).toBe(200);
    expect((await call("GET", "/api/v1/me", { headers: { cookie: `__Host-ts_session=${a.token}` } })).status).toBe(401);
  });
  it("atomically bounds unauthenticated challenge creation before Free-tier writes are exhausted", async () => {
    const day = new Date().toISOString().slice(0, 10);
    const before = await E.DB.prepare("SELECT COUNT(*) AS n FROM auth_challenges").first<{ n: number }>();
    await E.DB.prepare("INSERT INTO global_counters (day,metric,count) VALUES (?,'auth_challenge',999) ON CONFLICT(day,metric) DO UPDATE SET count=999").bind(day).run();
    const responses = await Promise.all(Array.from({ length: 10 }, (_, i) => call("POST", "/api/v1/auth/challenge", { body: { client: "android", install_id: `synthetic-burst-${i}` } })));
    expect(responses.filter((r) => r.status === 200)).toHaveLength(1);
    expect(responses.filter((r) => r.status === 429)).toHaveLength(9);
    expect(responses.find((r) => r.status === 429)!.headers.get("retry-after")).not.toBeNull();
    const after = await E.DB.prepare("SELECT COUNT(*) AS n FROM auth_challenges").first<{ n: number }>();
    expect(after!.n).toBe(before!.n + 1);
  });
});
