// End-to-end check on XRPL Testnet: ladder seeding, a guarded sale and the price floor.
//
//   npm run test:live
//
// Needs agent/.env with seeds. Sends REAL testnet transactions (about one minute) and
// consumes a little liquidity, which the market maker refills. Not part of `npm test`.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import xrpl from "xrpl";
import { LADDER, SEEDS, TOKEN_ISSUER } from "../config.js";
import {
  connect, getBids, loadWallets, parseFill, toDrops, tokenAmount, topUpTreasury,
} from "../xrplHelpers.js";
import { seedLadder, startMarketMaker } from "../marketMaker.js";
import { executeOrder } from "../executeOrder.js";
import { naiveSell } from "../naiveSell.js";

const AMOUNT = 1000;
const MAX_SLIPPAGE_PCT = 0.5;
const TOLERANCE = 1e-6;

let client;
let wallets;
let seqs;
let marketMaker = null;
let summary;
const events = [];

before(async () => {
  if (!SEEDS.issuer || !SEEDS.treasury || !SEEDS.marketMaker) {
    throw new Error("agent/.env with wallet seeds is required (get it from the group, or run npm run setup)");
  }
  client = await connect({ timeoutMs: 15_000 });
  wallets = loadWallets();
  await topUpTreasury(client, wallets.issuer, wallets.treasury.address, 30_000);
}, { timeout: 60_000 });

after(async () => {
  if (marketMaker) await marketMaker.stop();
  // The direct-ledger test consumes liquidity: put the ladder back for the next run.
  try {
    await seedLadder(client, wallets.marketMaker);
  } catch (error) {
    console.warn(`could not restore the ladder: ${error.message}`);
  }
  if (client) await client.disconnect();
}, { timeout: 60_000 });

test("the market maker publishes the configured ladder", { timeout: 120_000 }, async () => {
  seqs = await seedLadder(client, wallets.marketMaker);
  const ours = (await getBids(client, TOKEN_ISSUER)).filter((bid) => bid.owner === wallets.marketMaker.address);
  assert.equal(ours.length, LADDER.length, `expected ${LADDER.length} levels, found ${ours.length}`);
  ours.forEach((bid, i) => {
    const drift = Math.abs(bid.price - LADDER[i].price) / LADDER[i].price;
    assert.ok(drift < TOLERANCE, `level ${i}: price ${bid.price} != configured ${LADDER[i].price}`);
  });
});

test("a guarded sale completes within the mandate and never fills below the floor", { timeout: 180_000 }, async () => {
  marketMaker = startMarketMaker(client, wallets.marketMaker, seqs, { log: () => {} });
  try {
    summary = await executeOrder(client, wallets.treasury, AMOUNT, MAX_SLIPPAGE_PCT, {
      onEvent: (event) => events.push(event),
    });
  } finally {
    await marketMaker.stop();
    marketMaker = null;
  }

  assert.equal(summary.status, "completed", summary.reason ?? "sale did not complete");
  assert.ok(Math.abs(summary.sold - AMOUNT) < TOLERANCE, `sold ${summary.sold}, expected ${AMOUNT}`);
  assert.ok(summary.receivedXRP > 0, "no XRP received");
  assert.ok(summary.slippagePct <= MAX_SLIPPAGE_PCT, `slippage ${summary.slippagePct}% above mandate`);

  const chunks = events.filter((event) => event.type === "chunk");
  assert.ok(chunks.length >= 1, "no chunk events emitted");
  for (const chunk of chunks) {
    assert.ok(
      chunk.chunkPrice >= summary.minPrice * (1 - TOLERANCE),
      `chunk ${chunk.index} filled at ${chunk.chunkPrice}, below floor ${summary.minPrice}`,
    );
  }
  assert.ok(events.some((event) => event.type === "done"), "no done event");
  assert.ok(events.every((event) => event.mode === "guarded"), "an engine event has no guarded mode");
});

// Calls the ledger directly, without the engine: an IOC sell with a minimum XRP amount.
async function sellWithFloor(tokens, floor) {
  const result = await client.submitAndWait(
    {
      TransactionType: "OfferCreate",
      Account: wallets.treasury.address,
      TakerGets: tokenAmount(TOKEN_ISSUER, tokens),
      TakerPays: toDrops(tokens * floor),
      Flags: xrpl.OfferCreateFlags.tfImmediateOrCancel | xrpl.OfferCreateFlags.tfSell,
    },
    { wallet: wallets.treasury, autofill: true },
  );
  return parseFill(result, wallets.treasury.address);
}

test("the ledger stops a sell at the floor: partial fill, nothing below it", { timeout: 120_000 }, async () => {
  // Static book: no market maker running. Floor sits between L1 and L2.
  await seedLadder(client, wallets.marketMaker);
  const floor = (LADDER[1].price + LADDER[2].price) / 2;

  const fill = await sellWithFloor(25_000, floor);
  assert.equal(fill.code, "tesSUCCESS");
  const expected = LADDER[0].size + LADDER[1].size;
  assert.ok(
    Math.abs(fill.deliveredTokens - expected) < TOLERANCE,
    `sold ${fill.deliveredTokens}, expected ${expected} (L0 + L1 only)`,
  );
  assert.ok(fill.deliveredXRP / fill.deliveredTokens >= floor * (1 - TOLERANCE), "average fill below the floor");
});

test("an order whose floor is above the best bid is killed and sells nothing", { timeout: 60_000 }, async () => {
  const fill = await sellWithFloor(1_000, LADDER[0].price * 1.01);
  assert.equal(fill.code, "tecKILLED");
  assert.equal(fill.deliveredTokens, 0);
});

test("the naive sale emits start, chunk and done events that match its summary", { timeout: 120_000 }, async () => {
  const naiveEvents = [];
  const naive = await naiveSell(client, wallets.treasury, 1000, { onEvent: (event) => naiveEvents.push(event) });
  assert.equal(naive.status, "completed", naive.reason ?? "naive sale did not fill");
  assert.deepEqual(naiveEvents.map((event) => event.type), ["start", "chunk", "done"]);
  assert.ok(naiveEvents.every((event) => event.mode === "naive"), "a naive event has no naive mode");

  const [, chunk, done] = naiveEvents;
  assert.ok(Math.abs(chunk.sold - naive.sold) < TOLERANCE, "chunk and summary disagree on tokens sold");
  assert.ok(Math.abs(chunk.progressPct - (naive.sold / 1000) * 100) < TOLERANCE);
  assert.equal(done.status, "completed");
});

