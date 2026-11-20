// HTTP contract tests for the bridge. Only validation and access paths are covered:
// nothing here touches the ledger, so it runs offline. `npm test`.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

const ALLOWED = "http://localhost:3000";
// Set before importing server.js so the test does not depend on the local agent/.env.
process.env.ALLOWED_ORIGINS = ALLOWED;
const { server } = await import("../server.js");

let base;

before(() => new Promise((resolve) => {
  server.listen(0, "127.0.0.1", () => {
    base = `http://127.0.0.1:${server.address().port}`;
    resolve();
  });
}));

after(() => new Promise((resolve) => {
  server.closeAllConnections();
  server.close(resolve);
}));

const post = (path, body, headers = { "Content-Type": "application/json" }) =>
  fetch(`${base}${path}`, {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

test("unknown route returns 404 as JSON", async () => {
  const res = await fetch(`${base}/nope`);
  assert.equal(res.status, 404);
  assert.equal((await res.json()).ok, false);
});

test("health reports an idle bridge", async () => {
  const res = await fetch(`${base}/health`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.busy, false);
});

test("foreign browser origin is refused", async () => {
  const res = await fetch(`${base}/health`, { headers: { Origin: "https://evil.example" } });
  assert.equal(res.status, 403);
});

test("allowed origin receives the CORS header", async () => {
  const res = await fetch(`${base}/health`, { headers: { Origin: ALLOWED } });
  assert.equal(res.headers.get("access-control-allow-origin"), ALLOWED);
});

test("preflight from an allowed origin succeeds", async () => {
  const res = await fetch(`${base}/execute`, { method: "OPTIONS", headers: { Origin: ALLOWED } });
  assert.equal(res.status, 204);
});

test("POST without application/json is rejected", async () => {
  const res = await post("/execute", '{"mode":"naive"}', { "Content-Type": "text/plain" });
  assert.equal(res.status, 415);
});

test("invalid JSON is rejected", async () => {
  const res = await post("/execute", "{oops");
  assert.equal(res.status, 400);
});

test("unknown mode is rejected", async () => {
  const res = await post("/execute", { mode: "sell" });
  assert.equal(res.status, 400);
});

test("amount out of range is rejected", async () => {
  assert.equal((await post("/execute", { mode: "naive", amount: -1 })).status, 400);
  assert.equal((await post("/execute", { mode: "naive", amount: 1e9 })).status, 400);
});

test("maxSlippage out of range is rejected", async () => {
  assert.equal((await post("/execute", { mode: "guarded", maxSlippage: 0 })).status, 400);
  assert.equal((await post("/execute", { mode: "guarded", maxSlippage: 150 })).status, 400);
});

test("rejected requests never take the run lock", async () => {
  const body = await (await fetch(`${base}/health`)).json();
  assert.equal(body.busy, false);
});
