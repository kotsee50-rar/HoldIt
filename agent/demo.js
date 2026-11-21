// agent/demo.js
// End-to-end demo on testnet: Naive market sell vs HoldIt!, same amount, same book.
//
//   npm run demo                    (uses DEMO_AMOUNT and MAX_SLIPPAGE_PCT from .env)
//   npm run demo -- 50000 0.5
import { BASE_PRICE, DEMO_AMOUNT, LADDER, MAX_SLIPPAGE_PCT, TOKEN_ISSUER } from "./config.js";
import { connect, formatIou, loadWallets, topUpTreasury } from "./xrplHelpers.js";
import { describeLadder, seedLadder, startMarketMaker } from "./marketMaker.js";
import { naiveSell, printSummary } from "./naiveSell.js";
import { executeOrder } from "./executeOrder.js";

async function main() {
  const args = process.argv.slice(2);
  const amount = Number(args[0] ?? DEMO_AMOUNT);
  const maxSlippage = Number(args[1] ?? MAX_SLIPPAGE_PCT);
  const demoStart = Date.now();

  const client = await connect();
  const { issuer, treasury, marketMaker } = loadWallets();
  const depth = LADDER.reduce((sum, level) => sum + level.size, 0);
  if (amount > depth) {
    console.warn(`[WARN] ${formatIou(amount)} is deeper than the ladder (${formatIou(depth)}): the naive sell will only fill partially.`);
  }
  await topUpTreasury(client, issuer, treasury.address, amount * 2);

  console.log("\n=== Market ===");
  describeLadder();

  console.log("\n=== 1. The disaster: naive market sell ===");
  await seedLadder(client, marketMaker);
  const naive = await naiveSell(client, treasury, amount, { issuer: TOKEN_ISSUER });
  printSummary(naive);
  console.log(`   Slippage ${naive.slippagePct.toFixed(2)}% - Value destroyed`);

  console.log("\n=== 2. The solution: HoldIt! ===");
  console.log("Resetting the book to the same starting state...");
  const seqs = await seedLadder(client, marketMaker);
  const mm = startMarketMaker(client, marketMaker, seqs);
  const guarded = await executeOrder(client, treasury, amount, maxSlippage, { referencePrice: BASE_PRICE });
  await mm.stop();
  console.log(`\nExecution ${guarded.status}${guarded.reason ? ` (${guarded.reason})` : ""}, ${guarded.chunks} chunk(s)`);
  printSummary(guarded);
  console.log(`   Slippage ${guarded.slippagePct.toFixed(2)}% - Treasury safe`);

  console.log("\n=== Result ===");
  console.table({
    "Naive market sell": {
      sold: formatIou(naive.sold),
      "XRP received": naive.receivedXRP.toFixed(6),
      "slippage %": naive.slippagePct.toFixed(2),
      "time s": (naive.durationMs / 1000).toFixed(1),
    },
    "HoldIt!": {
      sold: formatIou(guarded.sold),
      "XRP received": guarded.receivedXRP.toFixed(6),
      "slippage %": guarded.slippagePct.toFixed(2),
      "time s": (guarded.durationMs / 1000).toFixed(1),
    },
  });
  const saved = guarded.receivedXRP - naive.receivedXRP;
  console.log(`HoldIt! received ${saved.toFixed(6)} XRP more (${((saved / naive.receivedXRP) * 100).toFixed(2)}%).`);
  console.log(`Total demo time: ${((Date.now() - demoStart) / 1000).toFixed(1)} s`);

  await client.disconnect();
}

main().catch((error) => {
  console.error("Demo failed:", error.message);
  process.exit(1);
});
