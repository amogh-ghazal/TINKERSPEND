import { describe, it, expect } from "vitest";
import { call, loginAndroid, idToken, allow, uuid, E } from "./helpers";

async function addTxn(token: string, body: Record<string, unknown>) {
  const r = await call("POST", "/api/v1/transactions", { token, body: { operation_id: uuid(), payment_status: "successful", effective_local_date: "2026-10-10", ...body } });
  if (r.status >= 300) throw new Error(r.text);
  return r.json.transaction;
}

describe("auth", () => {
  it("rejects non-allowlisted, reused challenge, wrong nonce and wrong audience", async () => {
    const ch = await call("POST", "/api/v1/auth/challenge", { body: { client: "android", install_id: "install-x-0001" } });
    const bad = await call("POST", "/api/v1/auth/google", { body: { challenge_id: ch.json.challenge_id, id_token: idToken({ sub: "x", email: "stranger@example.com", nonce: ch.json.nonce }), client: "android", install_id: "install-x-0001" } });
    expect(bad.status).toBe(403);
    expect(bad.json.error.code).toBe("not_allowlisted");
    await allow("stranger@example.com");
    const reuse = await call("POST", "/api/v1/auth/google", { body: { challenge_id: ch.json.challenge_id, id_token: idToken({ sub: "x", email: "stranger@example.com", nonce: ch.json.nonce }), client: "android", install_id: "install-x-0001" } });
    expect(reuse.status).toBe(401); // challenge consumed on first attempt

    const ch2 = await call("POST", "/api/v1/auth/challenge", { body: { client: "android", install_id: "install-x-0001" } });
    const wrongNonce = await call("POST", "/api/v1/auth/google", { body: { challenge_id: ch2.json.challenge_id, id_token: idToken({ sub: "x", email: "stranger@example.com", nonce: "nope" }), client: "android", install_id: "install-x-0001" } });
    expect(wrongNonce.status).toBe(401);
    const ch3 = await call("POST", "/api/v1/auth/challenge", { body: { client: "android", install_id: "install-x-0001" } });
    const aud = await call("POST", "/api/v1/auth/google", { body: { challenge_id: ch3.json.challenge_id, id_token: idToken({ sub: "x", email: "stranger@example.com", nonce: ch3.json.nonce, aud: "other" }), client: "android", install_id: "install-x-0001" } });
    expect(aud.status).toBe(401);
    const ch4 = await call("POST", "/api/v1/auth/challenge", { body: { client: "android", install_id: "install-x-0001" } });
    const unverified = await call("POST", "/api/v1/auth/google", { body: { challenge_id: ch4.json.challenge_id, id_token: idToken({ sub: "x", email: "stranger@example.com", nonce: ch4.json.nonce, email_verified: false }), client: "android", install_id: "install-x-0001" } });
    expect(unverified.status).toBe(403);
  });

  it("requires auth, rejects garbage tokens, revokes on logout and device revoke", async () => {
    expect((await call("GET", "/api/v1/me")).status).toBe(401);
    expect((await call("GET", "/api/v1/me", { token: "a".repeat(43) })).status).toBe(401);
    const a = await loginAndroid("sub-logout", "logout@example.com");
    expect((await call("GET", "/api/v1/me", { token: a.token })).status).toBe(200);
    expect((await call("POST", "/api/v1/auth/logout", { token: a.token, body: {} })).status).toBe(200);
    expect((await call("GET", "/api/v1/me", { token: a.token })).status).toBe(401);
    const b = await loginAndroid("sub-logout", "logout@example.com", "install-other-01");
    const c = await loginAndroid("sub-logout", "logout@example.com", "install-third-01");
    const devs = await call("GET", "/api/v1/devices", { token: c.token });
    const devB = devs.json.items.find((d: { id: string }) => d.id !== undefined && true);
    expect(devs.json.items.length).toBeGreaterThanOrEqual(2);
    // revoke the device behind session b
    const bMe = await E.DB.prepare("SELECT device_id FROM sessions WHERE user_id = ? AND revoked_at IS NULL ORDER BY created_at LIMIT 1").bind(b.userId).first();
    expect((await call("DELETE", `/api/v1/devices/${bMe.device_id}`, { token: c.token })).status).toBe(200);
    expect((await call("GET", "/api/v1/me", { token: b.token })).status).toBe(401);
    void devB;
  });

  it("web cookie sessions need CSRF for mutations", async () => {
    await allow("web@example.com");
    const ch = await call("POST", "/api/v1/auth/challenge", { body: { client: "web" } });
    const r = await call("POST", "/api/v1/auth/google", { body: { challenge_id: ch.json.challenge_id, id_token: idToken({ sub: "web1", email: "web@example.com", nonce: ch.json.nonce }), client: "web" } });
    expect(r.status).toBe(200);
    expect(r.json.token).toBeUndefined();
    const cookies = r.headers.getSetCookie();
    const session = cookies.find((c) => c.startsWith("__Host-ts_session="))!.split(";")[0]!;
    const csrfPair = cookies.find((c) => c.startsWith("__Host-ts_csrf="))!.split(";")[0]!;
    const csrf = csrfPair.split("=")[1]!;
    const body = { operation_id: uuid(), amount: "10", kind: "expense", payment_status: "successful", effective_local_date: "2026-10-01" };
    expect((await call("POST", "/api/v1/transactions", { body, headers: { cookie: session } })).status).toBe(403);
    expect((await call("POST", "/api/v1/transactions", { body, headers: { cookie: `${session}; ${csrfPair}`, "x-csrf-token": csrf } })).status).toBe(201);
    expect((await call("GET", "/api/v1/me", { headers: { cookie: session } })).status).toBe(200);
    // Bearer use of a web session token is refused
    expect((await call("GET", "/api/v1/me", { token: session.split("=")[1]! })).status).toBe(401);
  });
});

describe("ledger", () => {
  it("baseline monthly fixture: gross 560, refunds 50, net 510, review 250, pending 700", async () => {
    const { token } = await loginAndroid("sub-fixture", "fixture@example.com");
    await addTxn(token, { amount: "180", kind: "expense", category_id: "food_drinks", counterparty: "Restaurant" });
    await addTxn(token, { amount: "80", kind: "expense", category_id: "transport", counterparty: "Auto" });
    const split = await addTxn(token, { amount: "300", kind: "expense", allocations: [{ category_id: "groceries", amount: "200" }, { category_id: "household", amount: "100" }] });
    const ref = await call("POST", `/api/v1/transactions/${split.id}/refund`, { token, body: { operation_id: uuid(), original_transaction_id: split.id, amount: "50", effective_local_date: "2026-10-12", allocations: [{ category_id: "groceries", amount: "50" }] } });
    expect(ref.status).toBe(201);
    await addTxn(token, { amount: "2000", kind: "transfer" });
    await addTxn(token, { amount: "400", kind: "expense", payment_status: "failed", category_id: "shopping" });
    await addTxn(token, { amount: "700", kind: "expense", payment_status: "pending", category_id: "shopping" });
    await addTxn(token, { amount: "1000", kind: "income" });
    await addTxn(token, { amount: "250", kind: "unknown", counterparty: "Rahul Sharma" });
    const s = await call("GET", "/api/v1/summary?month=2026-10", { token });
    expect(s.json.grossSpendingPaise).toBe(56000);
    expect(s.json.refundsPaise).toBe(5000);
    expect(s.json.netSpendingPaise).toBe(51000);
    expect(s.json.needsReview.amountPaise).toBe(25000);
    expect(s.json.pending.amountPaise).toBe(70000);
    const groceries = s.json.byCategory.find((c: { categoryId: string }) => c.categoryId === "groceries");
    expect(groceries.netPaise).toBe(15000);
  });

  it("isolation: user B cannot read, edit, delete, refund or list user A's data", async () => {
    const a = await loginAndroid("sub-iso-a", "a@example.com");
    const b = await loginAndroid("sub-iso-b", "b@example.com");
    const t = await addTxn(a.token, { amount: "99.99", kind: "expense", category_id: "food_drinks" });
    expect((await call("GET", `/api/v1/transactions/${t.id}`, { token: b.token })).status).toBe(404);
    expect((await call("PATCH", `/api/v1/transactions/${t.id}`, { token: b.token, body: { version: 1, amount: "1" } })).status).toBe(404);
    expect((await call("DELETE", `/api/v1/transactions/${t.id}`, { token: b.token })).status).toBe(404);
    expect((await call("POST", `/api/v1/transactions/${t.id}/refund`, { token: b.token, body: { operation_id: uuid(), original_transaction_id: t.id, amount: "1", effective_local_date: "2026-10-11" } })).status).toBe(404);
    const list = await call("GET", "/api/v1/transactions?month=2026-10", { token: b.token });
    expect(list.json.items.find((x: { id: string }) => x.id === t.id)).toBeUndefined();
    expect((await call("GET", `/api/v1/transactions/${t.id}`, { token: a.token })).json.transaction.amount_paise).toBe(9999);
  });

  it("idempotent create, version conflicts, refund limits, reversal guard, cross-month refunds", async () => {
    const { token } = await loginAndroid("sub-idem", "idem@example.com");
    const op = uuid();
    const body = { operation_id: op, amount: "120.50", kind: "expense", payment_status: "successful", effective_local_date: "2026-09-30", category_id: "shopping" };
    const r1 = await call("POST", "/api/v1/transactions", { token, body });
    const r2 = await call("POST", "/api/v1/transactions", { token, body });
    expect(r1.status).toBe(201);
    expect(r2.json.replayed).toBe(true);
    expect(r2.json.transaction.id).toBe(r1.json.transaction.id);
    const id = r1.json.transaction.id;
    expect((await call("PATCH", `/api/v1/transactions/${id}`, { token, body: { version: 1, description: "x" } })).status).toBe(200);
    expect((await call("PATCH", `/api/v1/transactions/${id}`, { token, body: { version: 1, description: "stale" } })).status).toBe(409);
    const refund = (amount: string, date = "2026-10-02") => call("POST", `/api/v1/transactions/${id}/refund`, { token, body: { operation_id: uuid(), original_transaction_id: id, amount, effective_local_date: date } });
    expect((await refund("100")).status).toBe(201);
    expect((await refund("20.51")).status).toBe(422);
    expect((await refund("20.50")).status).toBe(201);
    const sep = await call("GET", "/api/v1/summary?month=2026-09", { token });
    const oct = await call("GET", "/api/v1/summary?month=2026-10", { token });
    expect(sep.json.grossSpendingPaise).toBe(12050);
    expect(sep.json.refundsPaise).toBe(0);
    expect(oct.json.refundsPaise).toBe(12050);
    expect(oct.json.netSpendingPaise).toBe(-12050);
    const rev = await addTxn(token, { amount: "10", kind: "expense", category_id: "shopping" });
    await call("PATCH", `/api/v1/transactions/${rev.id}`, { token, body: { version: 1, payment_status: "reversed" } });
    expect((await call("POST", `/api/v1/transactions/${rev.id}/refund`, { token, body: { operation_id: uuid(), original_transaction_id: rev.id, amount: "10", effective_local_date: "2026-10-02" } })).status).toBe(409);
  });

  it("rejects bad money, mismatched allocations and oversized bodies", async () => {
    const { token } = await loginAndroid("sub-val", "val@example.com");
    for (const amount of ["-5", "0", "1e3", "12.345", "abc"]) {
      const r = await call("POST", "/api/v1/transactions", { token, body: { operation_id: uuid(), amount, kind: "expense", payment_status: "successful", effective_local_date: "2026-10-10" } });
      expect(r.status, amount).toBe(422);
    }
    const mis = await call("POST", "/api/v1/transactions", { token, body: { operation_id: uuid(), amount: "100", kind: "expense", payment_status: "successful", effective_local_date: "2026-10-10", allocations: [{ category_id: "groceries", amount: "60" }, { category_id: "household", amount: "30" }] } });
    expect(mis.status).toBe(422);
    const big = await call("POST", "/api/v1/transactions", { token, body: "x".repeat(70 * 1024) });
    expect(big.status).toBe(413);
  });

  it("CSV export neutralises formulas", async () => {
    const { token } = await loginAndroid("sub-csv", "csv@example.com");
    await addTxn(token, { amount: "5", kind: "expense", counterparty: "=HYPERLINK(\"http://x\")", category_id: "other" });
    const r = await call("GET", "/api/v1/export.csv", { token });
    expect(r.text).toContain("'=HYPERLINK");
    expect(r.text).not.toMatch(/(^|,)=HYPERLINK/m);
  });
});

describe("notification ingestion", () => {
  const ev = (o: Record<string, unknown>) => ({
    event_id: uuid(), source_package: "in.tinkercraft.tinkerspend.fixture", source_key_hash: "k1", posted_at: Date.parse("2026-10-15T06:00:00Z"), captured_at: Date.now(),
    content_hash: "a".repeat(64), parser_version: "kt-1", title: "Payment successful", text: "Paid Rs. 180.00 to Cafe Coffee Day. UPI Ref No 412345678901", is_current_import: false, timezone: "Asia/Kolkata", ...o,
  });

  it("dedupes replays and repeated content, updates status, keeps distinct same-value payments, isolates users", async () => {
    const a = await loginAndroid("sub-n-a", "na@example.com");
    const first = ev({});
    const b1 = await call("POST", "/api/v1/notifications/batch", { token: a.token, body: { device_install_id: a.installId, events: [first] } });
    expect(b1.status).toBe(200);
    expect(b1.json.acks[0].status).toBe("accepted");
    const txnId = b1.json.acks[0].transaction_id;
    const replay = await call("POST", "/api/v1/notifications/batch", { token: a.token, body: { device_install_id: a.installId, events: [first] } });
    expect(replay.json.acks[0].status).toBe("duplicate");
    const repost = await call("POST", "/api/v1/notifications/batch", { token: a.token, body: { device_install_id: a.installId, events: [ev({})] } });
    expect(repost.json.acks[0].status).toBe("duplicate");
    // Same amount, different reference & time: distinct purchase, not merged.
    const second = await call("POST", "/api/v1/notifications/batch", { token: a.token, body: { device_install_id: a.installId, events: [ev({ content_hash: "b".repeat(64), posted_at: Date.parse("2026-10-15T07:00:00Z"), text: "Paid Rs. 180.00 to Cafe Coffee Day. UPI Ref No 412345678999" })] } });
    expect(second.json.acks[0].status).toBe("accepted");
    expect(second.json.acks[0].transaction_id).not.toBe(txnId);
    // OTP ignored
    const otp = await call("POST", "/api/v1/notifications/batch", { token: a.token, body: { device_install_id: a.installId, events: [ev({ content_hash: "c".repeat(64), title: "OTP", text: "123456 is your OTP for Rs 500. Do not share" })] } });
    expect(otp.json.acks[0].status).toBe("ignored");
    // Batch limit
    const tooMany = await call("POST", "/api/v1/notifications/batch", { token: a.token, body: { device_install_id: a.installId, events: Array.from({ length: 6 }, () => ev({})) } });
    expect(tooMany.status).toBe(422);
    // Wrong device id
    expect((await call("POST", "/api/v1/notifications/batch", { token: a.token, body: { device_install_id: "install-not-mine", events: [ev({})] } })).status).toBe(403);
    // Another user uploading the identical event gets their own record, not A's transaction.
    const b = await loginAndroid("sub-n-b", "nb@example.com");
    const other = await call("POST", "/api/v1/notifications/batch", { token: b.token, body: { device_install_id: b.installId, events: [first] } });
    expect(other.json.acks[0].status).toBe("accepted");
    expect(other.json.acks[0].transaction_id).not.toBe(txnId);
  });

  it("pending then success updates the same transaction; stale pending does not downgrade", async () => {
    const a = await loginAndroid("sub-n-s", "ns@example.com");
    const pend = await call("POST", "/api/v1/notifications/batch", { token: a.token, body: { device_install_id: a.installId, events: [ev({ content_hash: "d".repeat(64), title: "Payment pending", text: "Payment of Rs 700.00 to Big Bazaar is pending. UPI Ref No 512345678901" })] } });
    const id = pend.json.acks[0].transaction_id;
    const ok = await call("POST", "/api/v1/notifications/batch", { token: a.token, body: { device_install_id: a.installId, events: [ev({ content_hash: "e".repeat(64), posted_at: Date.parse("2026-10-15T06:05:00Z"), title: "Payment successful", text: "Paid Rs 700.00 to Big Bazaar. UPI Ref No 512345678901" })] } });
    expect(ok.json.acks[0].transaction_id).toBe(id);
    const stale = await call("POST", "/api/v1/notifications/batch", { token: a.token, body: { device_install_id: a.installId, events: [ev({ content_hash: "f".repeat(64), posted_at: Date.parse("2026-10-15T06:06:00Z"), title: "Payment pending", text: "Payment of Rs 700.00 to Big Bazaar is pending. UPI Ref No 512345678901" })] } });
    expect(stale.json.acks[0].transaction_id).toBe(id);
    const t = await call("GET", `/api/v1/transactions/${id}`, { token: a.token });
    expect(t.json.transaction.payment_status).toBe("successful");
  });

  it("web sessions cannot upload notifications", async () => {
    await allow("webn@example.com");
    const ch = await call("POST", "/api/v1/auth/challenge", { body: { client: "web" } });
    const r = await call("POST", "/api/v1/auth/google", { body: { challenge_id: ch.json.challenge_id, id_token: idToken({ sub: "webn", email: "webn@example.com", nonce: ch.json.nonce }), client: "web" } });
    const cookies = r.headers.getSetCookie();
    const session = cookies.find((c) => c.startsWith("__Host-ts_session="))!.split(";")[0]!;
    const csrfPair = cookies.find((c) => c.startsWith("__Host-ts_csrf="))!.split(";")[0]!;
    const res = await call("POST", "/api/v1/notifications/batch", { body: { device_install_id: "install-webn-01", events: [ev({})] }, headers: { cookie: `${session}; ${csrfPair}`, "x-csrf-token": csrfPair.split("=")[1]! } });
    expect(res.status).toBe(403);
  });
});
