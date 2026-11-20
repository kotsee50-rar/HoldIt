// agent/config.js
// Central configuration. Every value can be overridden from agent/.env
// (created by `npm run setup`, see .env.example).
import dotenv from "dotenv";
import xrpl from "xrpl";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const AGENT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const ENV_PATH = path.join(AGENT_DIR, ".env");

dotenv.config({ path: ENV_PATH });

const num = (name, fallback) => {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${name} must be a number, got "${raw}"`);
  return value;
};

const list = (name, fallback) => {
  const raw = process.env[name];
  if (!raw) return fallback;
  return raw.split(",").map((s) => Number(s.trim()));
};

export const NETWORK = process.env.XRPL_NETWORK || "wss://s.altnet.rippletest.net:51233";

// Standard currency codes are exactly 3 characters (longer codes need 40-char hex).
export const TOKEN_CURRENCY = process.env.TOKEN_CURRENCY || "TGD";

// Seeds are written by setup.js. Testnet only: never put mainnet seeds here.
export const SEEDS = {
  issuer: process.env.ISSUER_SEED,
  treasury: process.env.TREASURY_SEED,
  marketMaker: process.env.MM_SEED,
};

// Public address of the token issuer (safe to share, e.g. with the frontend).
export const TOKEN_ISSUER =
  process.env.TOKEN_ISSUER || (SEEDS.issuer ? xrpl.Wallet.fromSeed(SEEDS.issuer).address : undefined);

// --- Market (simulated liquidity) ---
// Best bid of the ladder, in XRP per token.
export const BASE_PRICE = num("BASE_PRICE", 0.0001);
// Bid ladder: each level is `size` tokens at BASE_PRICE * (1 - dropPct/100).
// Tight at the top, wide below: a single big market sell walks deep into it.
const LADDER_DROPS_PCT = list("LADDER_DROPS_PCT", [0, 0.2, 0.4, 3, 8, 14, 20, 25, 30, 35]);
const LADDER_SIZES = list("LADDER_SIZES", LADDER_DROPS_PCT.map(() => 10000));
if (LADDER_SIZES.length !== LADDER_DROPS_PCT.length) {
  throw new Error("LADDER_SIZES and LADDER_DROPS_PCT must have the same number of entries");
}
export const LADDER = LADDER_DROPS_PCT.map((dropPct, i) => ({
  level: i,
  dropPct,
  size: LADDER_SIZES[i],
  price: BASE_PRICE * (1 - dropPct / 100),
}));
// How often the market maker checks and refills its bids.
export const MM_INTERVAL_MS = num("MM_INTERVAL_MS", 1000);

// --- Execution engine ---
export const DEMO_AMOUNT = num("DEMO_AMOUNT", 100000);
export const MAX_SLIPPAGE_PCT = num("MAX_SLIPPAGE_PCT", 0.5);
// Upper bound for a single chunk, in tokens.
export const CHUNK_MAX = num("CHUNK_MAX", 20000);
// Fraction of the liquidity inside the slippage band that one chunk may take.
export const PARTICIPATION = num("PARTICIPATION", 0.7);
// Below this many tokens of in-band liquidity the engine waits instead of selling.
export const MIN_CHUNK = num("MIN_CHUNK", 100);
// How often the engine re-reads the book while waiting for liquidity.
export const POLL_MS = num("POLL_MS", 1000);
// Give up (partial fill) if in-band liquidity does not come back within this time.
export const LIQUIDITY_TIMEOUT_MS = num("LIQUIDITY_TIMEOUT_MS", 30000);

// --- Setup ---
// Tokens minted to the treasury by setup.js (and topped up by demo.js when low).
export const TREASURY_MINT = num("TREASURY_MINT", 1000000);
