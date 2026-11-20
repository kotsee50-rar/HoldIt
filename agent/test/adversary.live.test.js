// Adversary check on XRPL Testnet: an attacker dumps tokens into the bids right before a
// guarded sale. The floor must hold: the sale never fills below it, even when the book is hostile.
//
//   npm run test:adversary
//
// Sends real testnet transactions (about 40 seconds). Not part of `npm test`.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import xrpl from "xrpl";
import { LADDER, SEEDS, TOKEN_ISSUER } from "../config.js";
import {
  connect, loadWallets, parseFill, tokenAmount, topUpTreasury,
} from "../xrplHelpers.js";
import { seedLadder } from "../marketMaker.js";
import { executeOrder } from "../executeOrder.js";

const SALE = 50_000;
const MAX_SLIPPAGE_PCT = 0.5;
const DUMP = 80_000; // exactly the depth of L0..L7 in the default ladder
const TOLERANCE = 1e-6;
const IOC_SELL = xrpl.OfferCreateFlags.tfImmediateOrCancel | xrpl.OfferCreateFlags.tfSell;

let client;
let wallets;
let attacker;

before(async () => {
  if (!SEEDS.issuer || !SEEDS.treasury || !SEEDS.marketMaker) {
    throw new Error("agent/.env with wallet seeds is required (get it from the group, or run npm run setup)");
  }
  client = await connect({ timeoutMs: 15_000 });
  wallets = loadWallets();
  await topUpTreasury(client, wallets.issuer, wallets.treasury.address, SALE * 2);

  // Fresh ladder, no market maker running: the book stays exactly as the attacker leaves it.
  await seedLadder(client, wallets.marketMaker);

  // The attacker is a new testnet account that holds tokens from the issuer.
  attacker = (await client.fundWallet()).wallet;
  await client.submitAndWait(
    { TransactionType: "TrustSet", Account: attacker.address, LimitAmount: tokenAmount(TOKEN_ISSUER, 1e9) },
    { wallet: attacker, autofill: true },
  );
  await client.submitAndWait(
    { TransactionType: "Payment", Account: wallets.issuer.address, Destination: attacker.address, Amount: tokenAmount(TOKEN_ISSUER, DUMP) },
    { wallet: wallets.issuer, autofill: true },
  );
}, { timeout: 120_000 });

after(async () => {
  try {
    await seedLadder(client, wallets.marketMaker);
  } catch (error) {
    console.warn(`could not restore the ladder: ${error.message}`);
  }
  if (client) await client.disconnect();
}, { timeout: 60_000 });

test("the attacker's dump takes the top levels of the book", { timeout: 60_000 }, async () => {
  const result = await client.submitAndWait(
    {
      TransactionType: "OfferCreate",
      Account: attacker.address,
      TakerGets: tokenAmount(TOKEN_ISSUER, DUMP),
      TakerPays: "1", // any price: a plain market sell, ahead of our sale
      Flags: IOC_SELL,
    },
    { wallet: attacker, autofill: true },
  );
  const fill = parseFill(result, attacker.address);
  assert.equal(fill.code, "tesSUCCESS");
  assert.ok(Math.abs(fill.deliveredTokens - DUMP) < TOLERANCE, `attacker sold ${fill.deliveredTokens}, expected ${DUMP}`);
});

test("with the reference anchored to the pre-attack price, the sale never fills below the floor", { timeout: 120_000 }, async () => {
  const events = [];
  const summary = await executeOrder(client, wallets.treasury, SALE, MAX_SLIPPAGE_PCT, {
    referencePrice: LADDER[0].price, // the price the mandate was set against, before the dump
    liquidityTimeoutMs: 6_000,
    pollMs: 1_000,
    onEvent: (event) => events.push(event),
  });

  for (const chunk of events.filter((event) => event.type === "chunk")) {
    assert.ok(
      chunk.chunkPrice >= summary.minPrice * (1 - TOLERANCE),
      `chunk ${chunk.index} filled at ${chunk.chunkPrice}, below floor ${summary.minPrice}`,
    );
  }
  // Nothing above the anchored floor is left: the honest outcome is a halt, not a bad fill.
  assert.equal(summary.status, "halted", "expected a halt: no liquidity above the anchored floor");
  assert.equal(summary.sold, 0, "no token should be sold below the anchored floor");
  assert.ok(summary.reason && /liquidity/.test(summary.reason), `unexpected halt reason: ${summary.reason}`);
});

// Known limit, documented by a test: without an anchored reference, the reference is the best
// bid when the sale starts. The dump has already lowered it, so the floor moves down with it.
test("known limit: without an anchored reference, the attacker lowers the floor too", { timeout: 120_000 }, async () => {
  const events = [];
  const summary = await executeOrder(client, wallets.treasury, SALE, MAX_SLIPPAGE_PCT, {
    liquidityTimeoutMs: 6_000,
    pollMs: 1_000,
    onEvent: (event) => events.push(event),
  });

  assert.ok(summary.referencePrice < LADDER[0].price * 0.9, `reference ${summary.referencePrice} was not moved by the dump`);
  for (const chunk of events.filter((event) => event.type === "chunk")) {
    assert.ok(chunk.chunkPrice >= summary.minPrice * (1 - TOLERANCE), `chunk ${chunk.index} below its own floor`);
  }
  assert.ok(summary.slippagePct <= MAX_SLIPPAGE_PCT + TOLERANCE, `slippage ${summary.slippagePct}% above mandate`);
});
