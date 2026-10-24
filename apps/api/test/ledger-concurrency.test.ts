import { expect, it } from "vitest";
import { call, E, loginAndroid, uuid } from "./helpers";
import { app } from "../src/index";

it("a losing concurrent edit cannot change allocations or remembered categories", async () => {
  const a = await loginAndroid("edit-race", "edit-race@e2e.test");
  const created = await call("POST", "/api/v1/transactions", { token: a.token, body: { operation_id: uuid(), amount: "100", kind: "expense", payment_status: "successful", effective_local_date: "2026-10-25", counterparty: "Synthetic Race Mart", category_id: "food_drinks" } });
  const initial = created.json.transaction;
  // Force all requests to observe the initial version before any can submit its write batch.
  // This tests the real D1 batch side effects, not a probabilistic scheduling race.
  let readers = 0;
  let release: () => void = () => undefined;
  const barrier = new Promise<void>((resolve) => { release = resolve; });
  const wrap = (statement: D1PreparedStatement): D1PreparedStatement => new Proxy(statement, { get(target, key) {
    if (key === "bind") return (...values: unknown[]) => wrap(target.bind(...values));
    if (key === "first") return async (column?: string) => {
      const row = column === undefined ? await target.first() : await target.first(column);
      if (readers < 10) { readers++; if (readers === 10) release(); await barrier; }
      return row;
    };
    const value = Reflect.get(target, key, target);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  const db = new Proxy(E.DB, { get(target, key) {
    if (key === "prepare") return (sql: string) => sql.startsWith("SELECT * FROM transactions WHERE id =") ? wrap(target.prepare(sql)) : target.prepare(sql);
    const value = Reflect.get(target, key, target);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  const edits = await Promise.all(Array.from({ length: 10 }, async (_, i) => {
    const response = await app.fetch(new Request(`https://expenses.test/api/v1/transactions/${initial.id}`, { method: "PATCH", headers: { "content-type": "application/json", authorization: `Bearer ${a.token}` }, body: JSON.stringify({
      version: initial.version, amount: String(100 + i), description: `Winning edit ${i}`, category_id: i % 2 ? "household" : "food_drinks", apply_rule: { scope: "counterparty_exact" },
    }) }), { ...E, DB: db });
    return { status: response.status, json: await response.json() as { transaction: { amount_paise: number; description: string; version: number; allocations: Array<{ category_id: string; amount_paise: number }> } } };
  }));
  expect(edits.filter((r) => r.status === 200)).toHaveLength(1);
  expect(edits.filter((r) => r.status === 409)).toHaveLength(9);
  const winner = edits.find((r) => r.status === 200)!.json.transaction;
  const stored = (await call("GET", `/api/v1/transactions/${initial.id}`, { token: a.token })).json.transaction;
  expect(stored).toMatchObject({ amount_paise: winner.amount_paise, description: winner.description, version: winner.version });
  expect(stored.allocations).toEqual(winner.allocations);
  expect(stored.allocations.reduce((sum: number, line: { amount_paise: number }) => sum + line.amount_paise, 0)).toBe(stored.amount_paise);
  const rules = await call("GET", "/api/v1/category-rules", { token: a.token });
  expect(rules.json.items[0].category).toBe(winner.allocations[0]!.category_id);
});
