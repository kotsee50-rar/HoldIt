// agent/doctor.js
// Pre-demo health check: `npm run doctor`.
// Exit code 1 if something blocking fails. Warnings are informational.
import fs from "node:fs";
import path from "node:path";
import {
  AGENT_DIR, DEMO_AMOUNT, ENV_PATH, LADDER, NETWORK, SEEDS, TOKEN_CURRENCY, TOKEN_ISSUER,
} from "./config.js";
import { connect, formatIou, getBids, getReserves, getTokenBalance, loadWallets } from "./xrplHelpers.js";
import { ladderXrp } from "./marketMaker.js";

const MIN_NODE = { major: 20, minor: 19 };
const CONNECT_TIMEOUT_MS = 15_000;
const results = [];

const ICON = { ok: "[OK]  ", warn: "[WARN]", fail: "[FAIL]" };

function record(level, label, detail = "") {
  results.push({ level, label });
  console.log(`${ICON[level]} ${label}${detail ? ` — ${detail}` : ""}`);
}

function withTimeout(promise, ms, what) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms / 1000}s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function checkNode() {
  const [major, minor] = process.versions.node.split(".").map(Number);
  const ok = major > MIN_NODE.major || (major === MIN_NODE.major && minor >= MIN_NODE.minor);
  record(ok ? "ok" : "fail", `Node ${process.versions.node}`, ok ? "" : `need >= ${MIN_NODE.major}.${MIN_NODE.minor} (xrpl 5.x)`);
  return ok;
}

// Returns true only when the network checks can run.
function checkLocalFiles() {
  const depsOk = fs.existsSync(path.join(AGENT_DIR, "node_modules", "xrpl"));
  record(depsOk ? "ok" : "fail", "Dependencies installed", depsOk ? "" : "run `npm ci` in agent/");

  const envOk = fs.existsSync(ENV_PATH);
  record(envOk ? "ok" : "fail", "agent/.env present", envOk ? "" : "get it from the group, or run `npm run setup`");
  if (!envOk) return false;

  const missing = Object.entries(SEEDS).filter(([, seed]) => !seed).map(([name]) => name);
  record(missing.length ? "fail" : "ok", "Wallet seeds", missing.length ? `missing: ${missing.join(", ")}` : "");
  return depsOk && missing.length === 0;
}

async function checkNetwork() {
  const client = await withTimeout(connect(), CONNECT_TIMEOUT_MS, "connect");
  const { info } = (await client.request({ command: "server_info" })).result;
  const state = info.server_state;
  record(
    state === "full" ? "ok" : "warn",
    `Connected to ${NETWORK}`,
    `server state ${state}, validated ledger ${info.validated_ledger.seq}`,
  );
  return client;
}

async function xrpBalance(client, address) {
  try {
    const response = await client.request({ command: "account_info", account: address, ledger_index: "validated" });
    return Number(response.result.account_data.Balance) / 1e6;
  } catch (error) {
    if (error?.data?.error === "actNotFound") return null;
    throw error;
  }
}

async function checkWallets(client, wallets) {
  const reserves = await getReserves(client);

  const treasuryXrp = await xrpBalance(client, wallets.treasury.address);
  if (treasuryXrp === null) {
    record("fail", "Treasury account", "not found on testnet: seeds may be from another network");
  } else {
    record(treasuryXrp >= 2 ? "ok" : "warn", `Treasury XRP ${treasuryXrp.toFixed(2)}`, treasuryXrp >= 2 ? "" : "low: fees may fail");
  }

  // Same formula as ensureFunding() in marketMaker.js: ladder * 1.1 + reserves + 1 XRP.
  const mmNeeded = ladderXrp() * 1.1 + reserves.base + reserves.increment * (LADDER.length + 1) + 1;
  const mmXrp = await xrpBalance(client, wallets.marketMaker.address);
  if (mmXrp === null) {
    record("fail", "Market maker account", "not found on testnet: seeds may be from another network");
  } else if (mmXrp < mmNeeded) {
    record("warn", `Market maker XRP ${mmXrp.toFixed(2)}`, `below ${mmNeeded.toFixed(2)} needed: the faucet tops up on seed`);
  } else {
    record("ok", `Market maker XRP ${mmXrp.toFixed(2)}`, `needs ${mmNeeded.toFixed(2)}`);
  }

  const tokens = await getTokenBalance(client, wallets.treasury.address, TOKEN_ISSUER);
  record(
    tokens >= DEMO_AMOUNT ? "ok" : "warn",
    `Treasury holds ${formatIou(tokens)} ${TOKEN_CURRENCY}`,
    tokens >= DEMO_AMOUNT ? "" : "the bridge mints more on demand",
  );

  const bids = await getBids(client, TOKEN_ISSUER);
  const depth = bids.reduce((sum, bid) => sum + bid.tokens, 0);
  // Informational only: `npm run demo`, the bridge's /execute and /reset re-seed the ladder
  // themselves. Only `npm run execute` without --with-mm relies on the book as it is now.
  if (bids.length === 0) {
    record("warn", "Order book is empty", "fine for demo and bridge (they seed it); `npm run execute` without --with-mm needs `npm run mm -- --seed` first");
  } else {
    record("ok", `Order book: ${bids.length} bids, ${formatIou(depth)} ${TOKEN_CURRENCY} deep`, "demo and bridge re-seed it before each run");
  }
}

async function checkBridge() {
  const host = process.env.SERVER_HOST || "127.0.0.1";
  const port = process.env.SERVER_PORT || 8787;
  try {
    const response = await fetch(`http://${host}:${port}/health`, { signal: AbortSignal.timeout(2000) });
    const body = await response.json();
    record("ok", `Bridge running on :${port}`, body.busy ? `busy: ${body.run?.kind} run` : "idle");
  } catch {
    record("warn", `Bridge not running on :${port}`, "only the frontend needs it: `npm run server`");
  }
}

async function main() {
  console.log("HoldIt! doctor\n");
  checkNode();
  const canUseNetwork = checkLocalFiles();

  let client;
  if (canUseNetwork) {
    try {
      client = await checkNetwork();
      await checkWallets(client, loadWallets());
    } catch (error) {
      record("fail", "Testnet checks", error.message);
    }
  }
  await checkBridge();
  if (client) await client.disconnect();

  const failures = results.filter((r) => r.level === "fail").length;
  const warnings = results.filter((r) => r.level === "warn").length;
  const verdict = failures ? "[FAIL] Not ready" : warnings ? "[WARN] Ready, with warnings" : "[OK] Ready for the demo";
  console.log(`\n${verdict}: ${failures} failing, ${warnings} warnings`);
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error("Doctor crashed:", error.message);
  process.exit(1);
});
