// agent/executeOrder.js
// HoldIt! execution engine: sells a large amount in depth-aware chunks.
//
// Protection is enforced ON-CHAIN: every chunk is an OfferCreate with
// tfImmediateOrCancel | tfSell and a minimum price (TakerPays). The ledger
// refuses to fill below refPrice * (1 - maxSlippage), so the average price
// can never break the mandate. Unfilled parts are cancelled, never left on the book.
//
//   npm run execute -- 20000 0.5            (market maker running in another terminal)
//   npm run execute -- 20000 0.5 --with-mm  (market maker in the same process)
import xrpl from "xrpl";
import {
  CHUNK_MAX, DEMO_AMOUNT, LIQUIDITY_TIMEOUT_MS, MAX_SLIPPAGE_PCT, MIN_CHUNK, PARTICIPATION, POLL_MS,
  TOKEN_CURRENCY, TOKEN_ISSUER,
} from "./config.js";
import {
  connect, formatIou, getBids, getTokenBalance, isMain, loadWallets, parseFill, sleep, toDrops, tokenAmount,
} from "./xrplHelpers.js";
import { printSummary } from "./naiveSell.js";

const { tfImmediateOrCancel, tfSell } = xrpl.OfferCreateFlags;

// Default event printer. The frontend can pass its own `onEvent` instead.
export function logEvent(event) {
  switch (event.type) {
    case "start":
      if (event.mode === "naive") {
        console.log(`\nNaive market sell of ${formatIou(event.totalAmount)} ${TOKEN_CURRENCY}, no price floor`);
        console.log(`Reference price (best bid): ${event.referencePrice.toFixed(8)} XRP`);
        break;
      }
      console.log(`\nGuarded execution of ${formatIou(event.totalAmount)} ${TOKEN_CURRENCY}, max slippage ${event.maxSlippagePercent}%`);
      console.log(`Reference price (best bid): ${event.referencePrice.toFixed(8)} XRP | floor: ${event.minPrice.toFixed(8)} XRP`);
      break;
    case "chunk":
      console.log(
        `[OK] Chunk ${event.index}: sold ${formatIou(event.sold)} for ${event.receivedXRP.toFixed(6)} XRP` +
          ` | avg ${event.avgPrice.toFixed(8)} | slippage ${event.slippagePct.toFixed(3)}% | ${event.progressPct.toFixed(0)}%`,
      );
      break;
    case "waiting":
      console.log(`⏳ In-band liquidity ${formatIou(event.inBand)} ${TOKEN_CURRENCY}: waiting for the book to refill...`);
      break;
    case "killed":
      console.log(`Chunk ${event.index} killed on-chain (price moved below the floor). Nothing sold, retrying.`);
      break;
    case "halt":
      console.log(`Halted: ${event.reason}`);
      break;
    default:
      break;
  }
}

/**
 * @param {xrpl.Client} client  connected client
 * @param {xrpl.Wallet} wallet  treasury wallet (holds the tokens)
 * @param {number} totalAmount  tokens to sell
 * @param {number} maxSlippagePercent  e.g. 0.5 for 0.5%
 * @param {object} [options]  issuer, chunkMax, participation, minChunk, pollMs, liquidityTimeoutMs, onEvent
 * @returns {Promise<object>} execution summary
 */
export async function executeOrder(client, wallet, totalAmount, maxSlippagePercent, options = {}) {
  const {
    issuer = TOKEN_ISSUER,
    chunkMax = CHUNK_MAX,
    participation = PARTICIPATION,
    minChunk = MIN_CHUNK,
    pollMs = POLL_MS,
    liquidityTimeoutMs = LIQUIDITY_TIMEOUT_MS,
    onEvent = logEvent,
    // Optional anchored reference (XRP per token). Without it the reference is the best bid
    // when the sale starts, so a book moved before the sale moves the floor too.
    referencePrice: anchoredReference,
  } = options;
  // Every engine event carries mode, so a client can route by it without special cases.
  const emit = (event) => onEvent({ mode: "guarded", ...event });
  const startedAt = Date.now();
  const dust = Math.max(1e-6, totalAmount * 1e-9);

  const balance = await getTokenBalance(client, wallet.address, issuer);
  if (balance < totalAmount) {
    throw new Error(`Treasury holds ${formatIou(balance)} ${TOKEN_CURRENCY}, cannot sell ${formatIou(totalAmount)}`);
  }

  const initialBids = await getBids(client, issuer);
  if (initialBids.length === 0) throw new Error("Order book is empty: start the market maker first.");
  const referencePrice = anchoredReference ?? initialBids[0].price;
  const minPrice = referencePrice * (1 - maxSlippagePercent / 100);
  emit({ type: "start", totalAmount, maxSlippagePercent, referencePrice, minPrice });

  let sold = 0;
  let receivedXRP = 0;
  let index = 0;
  let waitingSince = null;
  let consecutiveKills = 0;
  let status = "completed";
  let reason = null;

  const summary = () => {
    const avgPrice = sold > 0 ? receivedXRP / sold : 0;
    return {
      mode: "guarded",
      status,
      reason,
      totalAmount,
      sold,
      receivedXRP,
      referencePrice,
      minPrice,
      avgPrice,
      slippagePct: avgPrice ? ((referencePrice - avgPrice) / referencePrice) * 100 : 0,
      chunks: index,
      durationMs: Date.now() - startedAt,
    };
  };

  while (totalAmount - sold > dust) {
    const remaining = totalAmount - sold;

    // 1. How much liquidity is there at or above our price floor?
    const bids = (await getBids(client, issuer)).filter((bid) => bid.owner !== wallet.address);
    const inBand = bids.filter((bid) => bid.price >= minPrice).reduce((sum, bid) => sum + bid.tokens, 0);

    // 2. Not enough safe liquidity: wait for it to come back (or give up after the timeout).
    if (inBand < Math.min(minChunk, remaining)) {
      if (waitingSince === null) {
        waitingSince = Date.now();
        emit({ type: "waiting", inBand, remaining });
      } else if (Date.now() - waitingSince > liquidityTimeoutMs) {
        status = "halted";
        reason = `no liquidity above the price floor for ${liquidityTimeoutMs / 1000}s`;
        emit({ type: "halt", reason, ...summary() });
        break;
      }
      await sleep(pollMs);
      continue;
    }
    waitingSince = null;

    // 3. Depth-aware chunk: a fraction of the in-band liquidity, capped.
    const chunk = Math.min(remaining, chunkMax, Math.max(inBand * participation, Math.min(inBand, minChunk)));

    // 4. Sell with an on-chain price floor.
    index += 1;
    const result = await client.submitAndWait(
      {
        TransactionType: "OfferCreate",
        Account: wallet.address,
        TakerGets: tokenAmount(issuer, chunk),         // we give TOKEN
        TakerPays: toDrops(chunk * minPrice),          // minimum XRP accepted = price floor
        Flags: tfImmediateOrCancel | tfSell,
      },
      { wallet, autofill: true },
    );

    // 5. Measure what actually happened from validated metadata.
    const fill = parseFill(result, wallet.address);
    if (fill.deliveredTokens <= 0) {
      emit({ type: "killed", index, code: fill.code });
      consecutiveKills += 1;
      if (consecutiveKills >= 5) {
        status = "halted";
        reason = `${consecutiveKills} chunks in a row killed by the price floor (${fill.code})`;
        emit({ type: "halt", reason, ...summary() });
        break;
      }
      await sleep(pollMs);
      continue;
    }
    consecutiveKills = 0;
    sold += fill.deliveredTokens;
    receivedXRP += fill.deliveredXRP;
    const current = summary();
    emit({
      type: "chunk",
      index,
      requested: chunk,
      sold: fill.deliveredTokens,
      receivedXRP: fill.deliveredXRP,
      chunkPrice: fill.deliveredXRP / fill.deliveredTokens,
      totalSold: sold,
      avgPrice: current.avgPrice,
      slippagePct: current.slippagePct,
      progressPct: (sold / totalAmount) * 100,
      hash: result.result.hash,
    });

    // 6. Safety net: the floor makes this unreachable, but never trust a single check.
    if (current.slippagePct > maxSlippagePercent) {
      status = "halted";
      reason = `slippage ${current.slippagePct.toFixed(3)}% above mandate`;
      emit({ type: "halt", reason, ...current });
      break;
    }
  }

  const final = summary();
  emit({ type: "done", ...final });
  return final;
}

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const amount = Number(args[0] ?? DEMO_AMOUNT);
  const maxSlippage = Number(args[1] ?? MAX_SLIPPAGE_PCT);
  const withMarketMaker = process.argv.includes("--with-mm");

  const client = await connect();
  const { treasury, marketMaker } = loadWallets();

  let mm = null;
  if (withMarketMaker) {
    const { seedLadder, startMarketMaker } = await import("./marketMaker.js");
    console.log("Seeding the bid ladder...");
    mm = startMarketMaker(client, marketMaker, await seedLadder(client, marketMaker));
  }

  const summary = await executeOrder(client, treasury, amount, maxSlippage);
  if (mm) await mm.stop();
  console.log(`\nExecution ${summary.status}${summary.reason ? ` (${summary.reason})` : ""}, ${summary.chunks} chunk(s)`);
  printSummary(summary);
  await client.disconnect();
}

if (isMain(import.meta.url)) {
  main().catch((error) => {
    console.error("Execution failed:", error.message);
    process.exit(1);
  });
}
