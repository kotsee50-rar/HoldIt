// HTTP contract tests for the bridge. Only validation and access paths are covered:
// nothing here touches the ledger, so it runs offline. `npm test`.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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

test("replay of an unknown recording is 404 and takes no lock", async () => {
  const res = await post("/replay", { name: "does-not-exist" });
  assert.equal(res.status, 404);
  assert.equal((await (await fetch(`${base}/health`)).json()).busy, false);
});

test("replay rejects path-like names and bad speeds", async () => {
  assert.equal((await post("/replay", { name: "../server" })).status, 400);
  assert.equal((await post("/replay", { name: "demo-guarded", speed: 0 })).status, 400);
});

test("replay re-emits the recorded run and finishes with its result", async () => {
  const recording = JSON.parse(readFileSync(new URL("../recordings/demo-guarded.json", import.meta.url), "utf8"));
  const res = await post("/replay", { name: "demo-guarded", speed: 100 });
  assert.equal(res.status, 202);

  let health;
  for (let i = 0; i < 100; i++) {
    health = await (await fetch(`${base}/health`)).json();
    if (!health.busy) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(health.busy, false);
  assert.equal(health.lastRun.kind, "execute");
  assert.equal(health.lastRun.params.replay, "demo-guarded");
  assert.equal(health.lastRun.ok, true);
  assert.equal(health.lastRun.result.sold, recording.result.sold);
  assert.equal(health.lastRun.result.slippagePct, recording.result.slippagePct);
});

test("without the testnet, /book serves the configured ladder as offline bids", async () => {
  const res = await fetch(`${base}/book`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.offline, true);
  assert.equal(body.bids.length, 10);
  assert.equal(body.bids[0].price, body.ladder[0].price);
});

test("without the testnet, live runs are refused with 503 and point to replay", async () => {
  const execute = await post("/execute", { mode: "naive", amount: 1000 });
  assert.equal(execute.status, 503);
  assert.match((await execute.json()).error, /POST \/replay/);
  assert.equal((await post("/reset", {})).status, 503);
  assert.equal((await (await fetch(`${base}/health`)).json()).online, false);
});
