// agent/xrplHelpers.js
// Small, verified building blocks shared by setup, market maker and execution engine.
import xrpl from "xrpl";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { NETWORK, SEEDS, TOKEN_CURRENCY } from "./config.js";

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// True when the file is run directly (`node file.js`), false when imported.
export function isMain(importMetaUrl) {
  if (!process.argv[1]) return false;
  try {
    return importMetaUrl === pathToFileURL(fs.realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
}

export async function connect() {
  const client = new xrpl.Client(NETWORK);
  await client.connect();
  return client;
}

export function loadWallets() {
  const missing = Object.entries(SEEDS).filter(([, seed]) => !seed).map(([name]) => name);
  if (missing.length) {
    throw new Error(`Missing seeds for: ${missing.join(", ")}. Run \`npm run setup\` first.`);
  }
  return {
    issuer: xrpl.Wallet.fromSeed(SEEDS.issuer),
    treasury: xrpl.Wallet.fromSeed(SEEDS.treasury),
    marketMaker: xrpl.Wallet.fromSeed(SEEDS.marketMaker),
  };
}

// IOU values: max 15 significant digits and never in exponent notation.
export function formatIou(value) {
  return Number(value).toLocaleString("en-US", { useGrouping: false, maximumSignificantDigits: 15 });
}

// XRP -> integer drops string (floored, so it never exceeds the given XRP amount).
export function toDrops(xrp) {
  return String(Math.floor(Number(xrp) * 1e6));
}

export function tokenAmount(issuerAddress, value) {
  return { currency: TOKEN_CURRENCY, issuer: issuerAddress, value: formatIou(value) };
}

/**
 * Bids for our token (people paying XRP to receive TOKEN), best price first.
 * Price is XRP per token, computed from the offer amounts.
 * NB: `quality` in this book is TOKEN per drop, NOT the price.
 */
export async function getBids(client, issuerAddress, limit = 50) {
  const response = await client.request({
    command: "book_offers",
    taker_gets: { currency: "XRP" },
    taker_pays: { currency: TOKEN_CURRENCY, issuer: issuerAddress },
    limit,
  });
  return response.result.offers
    .map((offer) => {
      // *_funded fields appear when the owner cannot fully fund the offer.
      const drops = Number(offer.taker_gets_funded ?? offer.TakerGets);
      const tokens = Number((offer.taker_pays_funded ?? offer.TakerPays).value);
      return { owner: offer.Account, tokens, xrp: drops / 1e6, price: drops / 1e6 / tokens };
    })
    .filter((bid) => bid.tokens > 0 && bid.xrp > 0);
}

/**
 * What a transaction actually did to `address`, from the validated metadata.
 * Returns XRP received (fee added back) and tokens sold.
 */
export function parseFill(result, address) {
  const meta = result.result.meta;
  const code = meta?.TransactionResult;
  if (code !== "tesSUCCESS") return { code, deliveredXRP: 0, deliveredTokens: 0 };
  const fee = Number(result.result.tx_json.Fee) / 1e6;
  const mine = xrpl.getBalanceChanges(meta).find((change) => change.account === address);
  const xrpChange = Number(mine?.balances.find((b) => b.currency === "XRP")?.value ?? 0);
  const tokenChange = Number(mine?.balances.find((b) => b.currency === TOKEN_CURRENCY)?.value ?? 0);
  return { code, deliveredXRP: xrpChange + fee, deliveredTokens: -tokenChange };
}

async function waitForValidation(client, hash, lastLedgerSequence) {
  for (;;) {
    try {
      const response = await client.request({ command: "tx", transaction: hash });
      if (response.result.validated) return response;
    } catch (error) {
      if (error?.data?.error !== "txnNotFound") throw error;
    }
    const ledger = await client.getLedgerIndex();
    if (ledger > lastLedgerSequence) {
      throw new Error(`Transaction ${hash} not validated before LastLedgerSequence ${lastLedgerSequence}`);
    }
    await sleep(500);
  }
}

/**
 * Submit several transactions from one account without waiting ~4s for each:
 * sequences are assigned up front, submitted back to back, then awaited together.
 * Batches stay below the per-account queue limit (10).
 */
export async function submitMany(client, wallet, txs, batchSize = 8) {
  const results = [];
  for (let start = 0; start < txs.length; start += batchSize) {
    const batch = txs.slice(start, start + batchSize);
    const first = await client.autofill(batch[0]);
    const prepared = [first];
    for (let i = 1; i < batch.length; i++) {
      prepared.push(await client.autofill({ ...batch[i], Sequence: first.Sequence + i }));
    }
    const lastLedger = Math.max(...prepared.map((tx) => tx.LastLedgerSequence));
    const signed = prepared.map((tx) => wallet.sign(tx));
    for (const { tx_blob } of signed) {
      const response = await client.submit(tx_blob);
      const engine = response.result.engine_result;
      if (/^(tem|tef|tel)/.test(engine)) {
        throw new Error(`Submit rejected: ${engine} - ${response.result.engine_result_message}`);
      }
    }
    results.push(...(await Promise.all(signed.map(({ hash }) => waitForValidation(client, hash, lastLedger)))));
  }
  return results;
}

export async function getTokenBalance(client, address, issuerAddress) {
  const response = await client.request({ command: "account_lines", account: address, peer: issuerAddress });
  const line = response.result.lines.find((l) => l.currency === TOKEN_CURRENCY);
  return Number(line?.balance ?? 0);
}

export async function getReserves(client) {
  const info = await client.request({ command: "server_info" });
  const ledger = info.result.info.validated_ledger;
  return { base: Number(ledger.reserve_base_xrp), increment: Number(ledger.reserve_inc_xrp) };
}

// Testnet faucet top-up of an existing wallet (+100 XRP). Rate limits are reported clearly.
export async function faucetTopUp(client, wallet) {
  try {
    const { balance } = await client.fundWallet(wallet);
    return balance;
  } catch (error) {
    throw new Error(`Faucet top-up failed for ${wallet.address} (rate limited?): ${error.message}`);
  }
}
