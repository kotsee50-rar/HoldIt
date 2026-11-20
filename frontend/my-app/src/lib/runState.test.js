// Tests for the event reducer. Run with `npm test` (no browser, no bridge needed).
import { test } from "node:test";
import assert from "node:assert/strict";
import { initialState, reduce } from "./runState.js";

const run = (state, events) => events.reduce(reduce, state);

test("hello sets connection, online flag and busy state", () => {
  const s = run(initialState(), [{ type: "connection:open" }, { type: "hello", online: true, busy: false, run: null }]);
  assert.equal(s.connected, true);
  assert.equal(s.online, true);
  assert.equal(s.busy, false);
});

test("a naive sale reaches the panel through run:end, not through the run kind", () => {
  const result = { status: "completed", slippagePct: 13.56, sold: 100000, receivedXRP: 8.644 };
  const s = run(initialState(), [
    { type: "run:start", runId: "a1", kind: "execute", params: { mode: "naive", amount: 100000 } },
    { type: "seeding", mode: "naive" },
    { type: "start", mode: "naive", totalAmount: 100000, maxSlippagePercent: null, referencePrice: 0.0001, minPrice: 0 },
    { type: "chunk", mode: "naive", index: 1, sold: 100000, progressPct: 100, avgPrice: 0.00008644, slippagePct: 13.56 },
    { type: "done", mode: "naive", ...result },
    { type: "run:end", runId: "a1", kind: "execute", ok: true, result },
  ]);
  assert.equal(s.naive.status, "completed");
  assert.equal(s.naive.result.slippagePct, 13.56);
  assert.equal(s.busy, false);
  assert.equal(s.guarded.log.length, 0, "naive events must not reach the guarded terminal");
});

test("events are routed by mode to their own panel", () => {
  const s = run(initialState(), [
    { type: "run:start", runId: "g1", kind: "execute", params: { mode: "guarded", amount: 1000 } },
    { type: "chunk", mode: "naive", index: 1, sold: 1000, progressPct: 40, avgPrice: 0.0001, slippagePct: 0 },
    { type: "chunk", mode: "guarded", index: 1, sold: 1000, progressPct: 100, avgPrice: 0.0001, slippagePct: 0.1, receivedXRP: 0.1, hash: "x" },
  ]);
  assert.equal(s.naive.progressPct, 40, "the naive chunk goes to the naive panel");
  assert.equal(s.guarded.progressPct, 100, "the guarded chunk goes to the guarded panel");
  assert.equal(s.guarded.slippagePct, 0.1);
  assert.equal(s.guarded.log.length, 2, "start line plus one chunk line only");
});

test("reset runs are ignored by the sale panels", () => {
  const before = initialState();
  const after = run(before, [
    { type: "run:start", runId: "r1", kind: "reset", params: {} },
    { type: "run:end", runId: "r1", kind: "reset", ok: true, result: { levels: 10 } },
  ]);
  assert.equal(after.busy, false);
  assert.equal(after.naive.status, "idle");
  assert.equal(after.guarded.status, "idle");
});

test("a failed run shows its error and marks the panel failed", () => {
  const s = run(initialState(), [
    { type: "run:start", runId: "f1", kind: "execute", params: { mode: "guarded", amount: 1000 } },
    { type: "run:end", runId: "f1", kind: "execute", ok: false, error: "treasury holds 0 TGD" },
  ]);
  assert.equal(s.guarded.status, "failed");
  assert.equal(s.error, "treasury holds 0 TGD");
  assert.equal(s.busy, false);
});

test("replay runs are labelled as replays", () => {
  const s = run(initialState(), [
    { type: "run:start", runId: "p1", kind: "execute", params: { mode: "guarded", amount: 100000, replay: "demo-guarded", speed: 1 } },
  ]);
  assert.match(s.guarded.log[0], /replay demo-guarded/);
});

test("guarded chunk lines show slippage and progress", () => {
  const s = run(initialState(), [
    { type: "run:start", runId: "g2", kind: "execute", params: { mode: "guarded", amount: 20000 } },
    { type: "chunk", mode: "guarded", index: 2, sold: 7000, progressPct: 35, avgPrice: 0.0000998, slippagePct: 0.2 },
  ]);
  assert.equal(s.guarded.progressPct, 35);
  assert.equal(s.guarded.log[0], "[CHUNK 2] Sold 7000 @ avg 0.00009980 | Slippage: 0.200%");
});

test("engine events without a mode are ignored", () => {
  const before = initialState();
  assert.deepEqual(reduce(before, { type: "chunk", index: 1 }), before);
});

test("a local error (409, 503, network) is kept for the user", () => {
  const s = reduce(initialState(), { type: "local:error", message: "busy: execute run in progress" });
  assert.equal(s.error, "busy: execute run in progress");
});
