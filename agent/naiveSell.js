// agent/naiveSell.js
// The "disaster" side of the demo: one market sell of the whole amount, no protection.
//
//   npm run naive -- 100000
import xrpl from "xrpl";
import { DEMO_AMOUNT, TOKEN_CURRENCY, TOKEN_ISSUER } from "./config.js";
import { connect, formatIou, getBids, isMain, loadWallets, parseFill, tokenAmount } from "./xrplHelpers.js";

const { tfImmediateOrCancel, tfSell } = xrpl.OfferCreateFlags;

export async function naiveSell(client, wallet, totalAmount, { issuer = TOKEN_ISSUER } = {}) {
  const startedAt = Date.now();
  const bids = await getBids(client, issuer);
  if (bids.length === 0) throw new Error("Order book is empty: start the market maker first.");
  const referencePrice = bids[0].price;

  const result = await client.submitAndWait(
    {
      TransactionType: "OfferCreate",
      Account: wallet.address,
      TakerGets: tokenAmount(issuer, totalAmount),
      TakerPays: "1", // accept any price: a pure market sell
      Flags: tfImmediateOrCancel | tfSell,
    },
    { wallet, autofill: true },
  );
  const fill = parseFill(result, wallet.address);
  const avgPrice = fill.deliveredTokens > 0 ? fill.deliveredXRP / fill.deliveredTokens : 0;
  return {
    mode: "naive",
    code: fill.code,
    totalAmount,
    sold: fill.deliveredTokens,
    receivedXRP: fill.deliveredXRP,
    referencePrice,
    avgPrice,
    slippagePct: avgPrice ? ((referencePrice - avgPrice) / referencePrice) * 100 : 0,
    durationMs: Date.now() - startedAt,
    hash: result.result.hash,
  };
}

export function printSummary(summary) {
  console.log(`   Sold:        ${formatIou(summary.sold)} / ${formatIou(summary.totalAmount)} ${TOKEN_CURRENCY}`);
  console.log(`   Received:    ${summary.receivedXRP.toFixed(6)} XRP`);
  console.log(`   Reference:   ${summary.referencePrice.toFixed(8)} XRP/${TOKEN_CURRENCY} (best bid at start)`);
  console.log(`   Avg price:   ${summary.avgPrice.toFixed(8)} XRP/${TOKEN_CURRENCY}`);
  console.log(`   Slippage:    ${summary.slippagePct.toFixed(2)}%`);
  console.log(`   Duration:    ${(summary.durationMs / 1000).toFixed(1)} s`);
}

async function main() {
  const amount = Number(process.argv[2] ?? DEMO_AMOUNT);
  const client = await connect();
  const { treasury } = loadWallets();
  console.log(`\n💥 Naive market sell of ${formatIou(amount)} ${TOKEN_CURRENCY}`);
  const summary = await naiveSell(client, treasury, amount);
  printSummary(summary);
  await client.disconnect();
}

if (isMain(import.meta.url)) {
  main().catch((error) => {
    console.error("Naive sell failed:", error.message);
    process.exit(1);
  });
}
