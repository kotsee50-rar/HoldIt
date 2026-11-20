// agent/marketMaker.js
// Simulated liquidity for the demo. The market maker keeps a ladder of bids
// (buy TOKEN, pay XRP) on the book and refills every level that gets eaten.
//
// IMPORTANT for the pitch: bids are refilled at FIXED prices. That models a
// market where makers replenish liquidity between chunks. It is why the
// guarded run shows almost no slippage. These are not real-world figures.
//
//   npm run mm               seed the ladder, then keep refilling (Ctrl+C to stop)
//   npm run mm -- --seed     seed the ladder once and exit
import { LADDER, MM_INTERVAL_MS, TOKEN_CURRENCY, TOKEN_ISSUER } from "./config.js";
import {
  connect, faucetTopUp, formatIou, getReserves, isMain, loadWallets, sleep, submitMany, toDrops, tokenAmount,
} from "./xrplHelpers.js";

const FULL = 1 - 1e-9; // tolerance when comparing remaining size with level size

export const ladderXrp = (ladder = LADDER) => ladder.reduce((sum, l) => sum + l.size * l.price, 0);

async function getOffers(client, address) {
  const response = await client.request({ command: "account_offers", account: address, ledger_index: "current" });
  return response.result.offers.map((offer) => ({
    seq: offer.seq,
    tokens: Number(offer.taker_pays.value ?? 0),
  }));
}

function bidTx(mm, issuer, level, replaceSeq) {
  const tx = {
    TransactionType: "OfferCreate",
    Account: mm.address,
    TakerGets: toDrops(level.size * level.price), // market maker pays XRP
    TakerPays: tokenAmount(issuer, level.size),    // ...to receive TOKEN
  };
  if (replaceSeq !== undefined) tx.OfferSequence = replaceSeq; // atomic cancel + replace
  return tx;
}

/**
 * XRP in offers is not locked: every bid is funded by the live balance.
 * Make sure the balance covers the whole ladder plus reserves; top up from the faucet if not.
 */
export async function ensureFunding(client, mm, ladder = LADDER) {
  const { base, increment } = await getReserves(client);
  const info = await client.request({ command: "account_info", account: mm.address, ledger_index: "current" });
  const balance = Number(info.result.account_data.Balance) / 1e6;
  const ownerCount = info.result.account_data.OwnerCount;
  const reserve = base + increment * Math.max(ownerCount, ladder.length + 1);
  const needed = ladderXrp(ladder) * 1.1 + reserve + 1; // 10% margin + 1 XRP for fees
  let available = balance;
  while (available < needed) {
    console.log(`Market maker balance ${available.toFixed(2)} XRP < ${needed.toFixed(2)} needed, faucet top-up...`);
    available = Number(await faucetTopUp(client, mm));
  }
  return available;
}

/** Replace every existing market-maker offer with a fresh full ladder. Returns level -> offer seq. */
export async function seedLadder(client, mm, issuer = TOKEN_ISSUER, ladder = LADDER) {
  await ensureFunding(client, mm, ladder);
  const existing = await getOffers(client, mm.address);
  const txs = ladder.map((level, i) => bidTx(mm, issuer, level, existing[i]?.seq));
  for (const extra of existing.slice(ladder.length)) {
    txs.push({ TransactionType: "OfferCancel", Account: mm.address, OfferSequence: extra.seq });
  }
  const results = await submitMany(client, mm, txs);
  const seqs = new Map();
  results.slice(0, ladder.length).forEach((response, i) => {
    const code = response.result.meta.TransactionResult;
    if (code !== "tesSUCCESS") console.warn(`[WARN] Level ${i} bid failed: ${code}`);
    seqs.set(i, response.result.tx_json.Sequence);
  });
  return seqs;
}

/** Refill levels that were partially or fully consumed. Returns how many were refilled. */
export async function refillLadder(client, mm, seqs, issuer = TOKEN_ISSUER, ladder = LADDER) {
  const offers = new Map((await getOffers(client, mm.address)).map((o) => [o.seq, o]));
  const toRefill = ladder.filter((level, i) => {
    const offer = offers.get(seqs.get(i));
    return !offer || offer.tokens < level.size * FULL;
  });
  if (toRefill.length === 0) return 0;
  await ensureFunding(client, mm, ladder);
  const txs = toRefill.map((level) => {
    const current = offers.get(seqs.get(level.level));
    return bidTx(mm, issuer, level, current?.seq);
  });
  const results = await submitMany(client, mm, txs);
  results.forEach((response, i) => seqs.set(toRefill[i].level, response.result.tx_json.Sequence));
  return toRefill.length;
}

/** Start the refill loop in the background. Call `await mm.stop()` to end it. */
export function startMarketMaker(client, mm, seqs, { issuer = TOKEN_ISSUER, intervalMs = MM_INTERVAL_MS, log = console.log } = {}) {
  let running = true;
  const loop = (async () => {
    while (running) {
      try {
        const refilled = await refillLadder(client, mm, seqs, issuer);
        if (refilled) log(`   Market maker refilled ${refilled} bid level(s)`);
      } catch (error) {
        log(`   [WARN] Market maker error: ${error.message}`);
      }
      await sleep(intervalMs);
    }
  })();
  return {
    stop: async () => {
      running = false;
      await loop;
    },
  };
}

export function describeLadder(ladder = LADDER) {
  const depth = ladder.reduce((sum, l) => sum + l.size, 0);
  console.log(`Bid ladder: ${ladder.length} levels, ${formatIou(depth)} ${TOKEN_CURRENCY} deep, ${ladderXrp(ladder).toFixed(2)} XRP`);
  for (const l of ladder) {
    console.log(`   L${l.level}  ${formatIou(l.size).padStart(7)} ${TOKEN_CURRENCY} @ ${l.price.toFixed(8)} XRP  (-${l.dropPct}%)`);
  }
}

async function main() {
  const client = await connect();
  const { marketMaker } = loadWallets();
  console.log(`Market maker ${marketMaker.address}`);
  describeLadder();
  const seqs = await seedLadder(client, marketMaker);
  console.log("[OK] Ladder seeded.");
  if (process.argv.includes("--seed")) {
    await client.disconnect();
    return;
  }
  console.log(`Refilling every ${MM_INTERVAL_MS} ms. Ctrl+C to stop.`);
  const mm = startMarketMaker(client, marketMaker, seqs);
  process.on("SIGINT", async () => {
    await mm.stop();
    await client.disconnect();
    process.exit(0);
  });
}

if (isMain(import.meta.url)) {
  main().catch((error) => {
    console.error("Market maker failed:", error.message);
    process.exit(1);
  });
}
