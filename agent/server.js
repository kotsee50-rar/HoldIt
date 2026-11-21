// agent/server.js
// Local bridge between the execution engine and the frontend.
// HTTP for commands, Server-Sent Events (SSE) for live progress. No extra dependencies.
//
//   npm run server        listens on http://127.0.0.1:8787
//   npm run server -- --offline   no testnet at all: /health, /events, /replay, static /book
//
// Endpoints
//   GET  /health   liveness, current run and last finished run
//   GET  /book     bids of the token on testnet, plus the ladder configuration
//   POST /reset    re-seed the market-maker ladder (async, streams run:start / run:end)
//   POST /execute  body: { mode: "naive" | "guarded", amount?, maxSlippage?, reset? }
//                  naive:   one market sell. reset (default true) re-seeds the ladder first.
//                  guarded: always starts from a fresh ladder and runs the market maker
//                           in the background for the duration of the sale.
//   POST /replay   body: { name, speed? } replays a curated recording from recordings/
//                  with its original timing (speed divides it, default 1). No ledger access.
//   GET  /events   SSE stream: hello, run:start, engine events (start, chunk, waiting,
//                  killed, halt, done), run:end
//
// Only one run at a time: a second POST gets 409 until the first one finishes.
// Browser access is limited to ALLOWED_ORIGINS (see .env.example).
import "./config.js"; // loads agent/.env before anything else reads process.env
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  AGENT_DIR, BASE_PRICE, DEMO_AMOUNT, LADDER, MAX_SLIPPAGE_PCT, NETWORK, TOKEN_CURRENCY, TOKEN_ISSUER,
} from "./config.js";
import { connect, ensureConnected, getBids, isMain, loadWallets, sleep, topUpTreasury } from "./xrplHelpers.js";
import { seedLadder, startMarketMaker } from "./marketMaker.js";
import { naiveSell } from "./naiveSell.js";
import { executeOrder, logEvent } from "./executeOrder.js";

const HOST = process.env.SERVER_HOST || "127.0.0.1";
const PORT = Number(process.env.SERVER_PORT || 8787);
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const MAX_AMOUNT = 10_000_000;
const MAX_BODY_BYTES = 16 * 1024;
const HEARTBEAT_MS = 15_000;
// Recordings: finished live sales are saved to recordings/live/ (gitignored).
// Curated runs for the demo live directly in recordings/ and are replayed with POST /replay.
const RECORDINGS_DIR = path.join(AGENT_DIR, "recordings");
const LIVE_DIR = path.join(RECORDINGS_DIR, "live");
const RECORDING_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/i;
const REPLAY_MAX_GAP_MS = 2500; // long pauses (e.g. ladder seeding) are shortened on replay
const CONNECT_TIMEOUT_MS = 10_000;

const state = { busy: false, run: null, lastRun: null };
const subscribers = new Set();
let client;
let wallets;
let recording = null; // engine events of the live run in progress
let online = false; // true once connected to the testnet

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function corsHeaders(origin) {
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

function sendJson(res, status, body, origin) {
  res.writeHead(status, { "Content-Type": "application/json", ...corsHeaders(origin) });
  res.end(JSON.stringify(body));
}

function broadcast(event) {
  const line = `data: ${JSON.stringify({ ...event, at: Date.now() })}\n\n`;
  for (const res of subscribers) res.write(line);
  if (recording && !event.type.startsWith("run:")) {
    recording.events.push({ t: Date.now() - recording.startedAt, event });
  }
  logEvent(event);
}

async function readJson(req) {
  if (!req.headers["content-type"]?.startsWith("application/json")) {
    throw new HttpError(415, "Content-Type must be application/json");
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, "request body too large");
    chunks.push(chunk);
  }
  if (size === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "body must be valid JSON");
  }
}

function parseExecute(body) {
  const { mode } = body;
  if (mode !== "naive" && mode !== "guarded") {
    throw new HttpError(400, 'mode must be "naive" or "guarded"');
  }
  const amount = body.amount === undefined ? DEMO_AMOUNT : Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) {
    throw new HttpError(400, `amount must be > 0 and <= ${MAX_AMOUNT}`);
  }
  const maxSlippage = body.maxSlippage === undefined ? MAX_SLIPPAGE_PCT : Number(body.maxSlippage);
  if (!Number.isFinite(maxSlippage) || maxSlippage <= 0 || maxSlippage > 100) {
    throw new HttpError(400, "maxSlippage must be a percentage in (0, 100]");
  }
  return { mode, amount, maxSlippage, reset: body.reset !== false };
}

// Takes the run lock synchronously, so two concurrent POSTs cannot both start.
function requireOnline() {
  if (!online) throw new HttpError(503, "testnet not connected, use POST /replay");
}

function lock(kind, params = {}) {
  if (state.busy) throw new HttpError(409, `busy: ${state.run.kind} run in progress`);
  state.busy = true;
  state.run = { id: crypto.randomUUID(), kind, params, startedAt: Date.now() };
  return state.run;
}

function release() {
  state.busy = false;
  state.run = null;
}

// Runs `work` in the background with the lock already held. Returns the run id at once.
function saveLiveRecording(id, params, result) {
  try {
    fs.mkdirSync(LIVE_DIR, { recursive: true });
    const file = path.join(LIVE_DIR, `${id}.json`);
    const data = {
      runId: id,
      kind: "execute",
      params,
      recordedAt: new Date(recording.startedAt).toISOString(),
      endT: Date.now() - recording.startedAt,
      result,
      events: recording.events,
    };
    fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
    console.log(`recording saved: ${file}`);
  } catch (error) {
    console.error(`recording not saved: ${error.message}`);
  }
}

function launch(work) {
  const { id, kind, params } = state.run;
  console.log(`[START] ${kind} ${id}`);
  if (kind === "execute" && !params.replay) recording = { startedAt: Date.now(), events: [] };
  broadcast({ type: "run:start", runId: id, kind, params });
  work()
    .then((result) => {
      state.lastRun = { id, kind, params, ok: true, result, finishedAt: Date.now() };
      console.log(`[END] ${kind} ${id} finished`);
      if (recording) saveLiveRecording(id, params, result);
      broadcast({ type: "run:end", runId: id, kind, ok: true, result });
    })
    .catch((error) => {
      state.lastRun = { id, kind, params, ok: false, error: error.message, finishedAt: Date.now() };
      console.error(`[END] ${kind} ${id} failed: ${error.message}`);
      broadcast({ type: "run:end", runId: id, kind, ok: false, error: error.message });
    })
    .finally(() => {
      recording = null;
      release();
    });
  return id;
}

async function runExecute({ mode, amount, maxSlippage, reset }) {
  await ensureConnected(client);
  if (mode === "naive") {
    if (reset) {
      broadcast({ type: "seeding", mode: "naive" });
      await seedLadder(client, wallets.marketMaker);
    }
    return naiveSell(client, wallets.treasury, amount, { onEvent: broadcast });
  }
  broadcast({ type: "seeding", mode: "guarded" });
  const seqs = await seedLadder(client, wallets.marketMaker);
  const marketMaker = startMarketMaker(client, wallets.marketMaker, seqs);
  try {
    // Anchored to the mandate's reference price, not to the book: a book moved before the run
    // cannot move the floor (see executeOrder's referencePrice option).
    return await executeOrder(client, wallets.treasury, amount, maxSlippage, {
      onEvent: broadcast,
      referencePrice: BASE_PRICE,
    });
  } finally {
    await marketMaker.stop();
  }
}

async function loadRecording(name) {
  if (typeof name !== "string" || !RECORDING_NAME.test(name)) {
    throw new HttpError(400, "recording name must be letters, digits and dashes");
  }
  try {
    return JSON.parse(await fs.promises.readFile(path.join(RECORDINGS_DIR, `${name}.json`), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") throw new HttpError(404, `no recording named ${name}`);
    throw error;
  }
}

// Re-emits the recorded engine events with their original timing (divided by speed).
// Touches no ledger: it works offline, which is the point.
async function runReplay(data, speed) {
  let previous = 0;
  for (const { t, event } of data.events) {
    const gap = Math.min(t - previous, REPLAY_MAX_GAP_MS);
    previous = t;
    if (gap > 0) await sleep(gap / speed);
    broadcast(event);
  }
  const tail = Math.min((data.endT ?? previous) - previous, REPLAY_MAX_GAP_MS);
  if (tail > 0) await sleep(tail / speed);
  return data.result;
}

function openEvents(req, res, origin) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
    ...corsHeaders(origin),
  });
  const hello = { type: "hello", online, busy: state.busy, run: state.run, lastRun: state.lastRun, at: Date.now() };
  res.write(`data: ${JSON.stringify(hello)}\n\n`);
  subscribers.add(res);
  const heartbeat = setInterval(() => res.write(": ping\n\n"), HEARTBEAT_MS);
  res.on("close", () => {
    clearInterval(heartbeat);
    subscribers.delete(res);
  });
}

async function route(req, res, url, origin) {
  const { method } = req;
  const path = url.pathname;

  if (method === "OPTIONS") {
    res.writeHead(204, corsHeaders(origin));
    return res.end();
  }
  // Refuse foreign browser origins outright. Requests without an Origin (curl, scripts) pass.
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    console.warn(`403: origin ${origin} not allowed, add it to ALLOWED_ORIGINS`);
    throw new HttpError(403, "origin not allowed");
  }

  if (method === "GET" && path === "/events") return openEvents(req, res, origin);

  if (method === "GET" && path === "/health") {
    return sendJson(res, 200, {
      ok: true,
      online,
      busy: state.busy,
      run: state.run,
      lastRun: state.lastRun,
      subscribers: subscribers.size,
    }, origin);
  }

  if (method === "GET" && path === "/book" && !online) {
    const bids = LADDER.map((level) => ({ tokens: level.size, xrp: level.size * level.price, price: level.price }));
    return sendJson(res, 200, {
      currency: TOKEN_CURRENCY,
      issuer: TOKEN_ISSUER,
      offline: true,
      busy: state.busy,
      bids,
      ladder: LADDER,
    }, origin);
  }

  if (method === "GET" && path === "/book") {
    try {
      await ensureConnected(client);
    } catch {
      return sendJson(res, 503, { ok: false, error: "testnet not reachable, retry in a moment" }, origin);
    }
    const bids = await getBids(client, TOKEN_ISSUER, 20);
    return sendJson(res, 200, {
      currency: TOKEN_CURRENCY,
      issuer: TOKEN_ISSUER,
      busy: state.busy,
      bids: bids.map(({ tokens, xrp, price }) => ({ tokens, xrp, price })),
      ladder: LADDER,
    }, origin);
  }

  if (method === "POST" && path === "/reset") {
    await readJson(req);
    requireOnline();
    lock("reset");
    const id = launch(async () => {
      await seedLadder(client, wallets.marketMaker);
      return { levels: LADDER.length };
    });
    return sendJson(res, 202, { runId: id }, origin);
  }

  if (method === "POST" && path === "/execute") {
    const params = parseExecute(await readJson(req));
    requireOnline();
    lock("execute", params);
    try {
      await ensureConnected(client);
      await topUpTreasury(client, wallets.issuer, wallets.treasury.address, params.amount);
    } catch (error) {
      release();
      throw new HttpError(503, `treasury top-up failed: ${error.message}`);
    }
    const id = launch(() => runExecute(params));
    return sendJson(res, 202, { runId: id, params }, origin);
  }

  if (method === "POST" && path === "/replay") {
    const body = await readJson(req);
    const speed = body.speed === undefined ? 1 : Number(body.speed);
    if (!Number.isFinite(speed) || speed <= 0 || speed > 100) {
      throw new HttpError(400, "speed must be a number in (0, 100]");
    }
    const data = await loadRecording(body.name);
    if (!Array.isArray(data.events)) throw new HttpError(500, "recording has no events");
    // Same kind and params shape as a live run, so the frontend needs no special case.
    lock("execute", { ...(data.params ?? {}), replay: body.name, speed });
    const id = launch(() => runReplay(data, speed));
    return sendJson(res, 202, { runId: id, name: body.name, speed }, origin);
  }

  throw new HttpError(404, `no route for ${method} ${path}`);
}

export const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  const url = new URL(req.url, `http://${req.headers.host ?? HOST}`);
  try {
    await route(req, res, url, origin);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    if (status === 500) console.error(error);
    if (!res.headersSent) {
      sendJson(res, status, { ok: false, error: status === 500 ? "internal error" : error.message }, origin);
    }
  }
});

async function shutdown() {
  if (state.busy) console.log(`\nStopping while a ${state.run.kind} run is in progress.`);
  console.log("\nShutting down.");
  for (const res of subscribers) res.end();
  server.close();
  if (client?.isConnected()) await client.disconnect();
  process.exit(0);
}

async function connectTestnet() {
  try {
    wallets = loadWallets();
    client = await connect({ timeoutMs: CONNECT_TIMEOUT_MS });
    online = true;
    console.log(`Connected to ${NETWORK}`);
  } catch (error) {
    console.warn(`[WARN] Testnet unavailable (${error.message}).`);
    console.warn("   Starting OFFLINE: /health, /events, /replay and a static /book only.");
  }
}

async function main() {
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  server.listen(PORT, HOST, () => {
    console.log(`HoldIt! bridge on http://${HOST}:${PORT}`);
    console.log(`Allowed browser origins: ${ALLOWED_ORIGINS.join(", ")}`);
  });
  if (process.argv.includes("--offline")) {
    console.log("--offline: testnet not contacted.");
  } else {
    await connectTestnet();
  }
}

if (isMain(import.meta.url)) {
  main().catch((error) => {
    console.error("Server failed to start:", error.message);
    process.exit(1);
  });
}
