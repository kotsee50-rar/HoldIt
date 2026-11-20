// agent/setup.js
// One-time testnet setup: creates issuer, treasury and market-maker wallets,
// issues the token to the treasury and saves the seeds in agent/.env.
//
//   npm run setup            (refuses if agent/.env already has seeds)
//   npm run setup -- --force (creates new wallets and overwrites the seeds)
import xrpl from "xrpl";
import fs from "node:fs";
import { ENV_PATH, NETWORK, SEEDS, TOKEN_CURRENCY, TREASURY_MINT } from "./config.js";
import { connect, faucetTopUp, formatIou, tokenAmount } from "./xrplHelpers.js";

function upsertEnv(values) {
  const lines = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, "utf8").split("\n") : [];
  for (const [key, value] of Object.entries(values)) {
    const index = lines.findIndex((line) => line.startsWith(`${key}=`));
    if (index >= 0) lines[index] = `${key}=${value}`;
    else lines.push(`${key}=${value}`);
  }
  fs.writeFileSync(ENV_PATH, lines.join("\n").replace(/\n*$/, "\n"));
}

async function submitOk(client, wallet, tx) {
  const result = await client.submitAndWait(tx, { wallet, autofill: true });
  const code = result.result.meta.TransactionResult;
  if (code !== "tesSUCCESS") throw new Error(`${tx.TransactionType} failed: ${code}`);
  return result;
}

async function main() {
  const force = process.argv.includes("--force");
  if (Object.values(SEEDS).every(Boolean) && !force) {
    console.log("agent/.env already contains wallet seeds. Nothing to do.");
    console.log("Run `npm run setup -- --force` to create a fresh set of wallets.");
    return;
  }

  const client = await connect();
  console.log(`Connected to ${NETWORK}`);

  console.log("Funding wallets from the testnet faucet...");
  const { wallet: issuer } = await client.fundWallet();
  const { wallet: treasury } = await client.fundWallet();
  const { wallet: marketMaker } = await client.fundWallet();
  // The market maker needs XRP to post bids: one extra top-up (+100 XRP).
  await faucetTopUp(client, marketMaker);
  console.log(`  issuer       ${issuer.address}`);
  console.log(`  treasury     ${treasury.address}`);
  console.log(`  market maker ${marketMaker.address}`);

  // DefaultRipple must be set BEFORE trust lines exist, otherwise tokens
  // cannot move between holders (treasury -> market maker) through the issuer.
  await submitOk(client, issuer, {
    TransactionType: "AccountSet",
    Account: issuer.address,
    SetFlag: xrpl.AccountSetAsfFlags.asfDefaultRipple,
  });

  await Promise.all(
    [treasury, marketMaker].map((wallet) =>
      submitOk(client, wallet, {
        TransactionType: "TrustSet",
        Account: wallet.address,
        LimitAmount: tokenAmount(issuer.address, 1e12),
      }),
    ),
  );
  console.log(`Trust lines for ${TOKEN_CURRENCY} created.`);

  await submitOk(client, issuer, {
    TransactionType: "Payment",
    Account: issuer.address,
    Destination: treasury.address,
    Amount: tokenAmount(issuer.address, TREASURY_MINT),
  });
  console.log(`Issued ${formatIou(TREASURY_MINT)} ${TOKEN_CURRENCY} to the treasury.`);

  upsertEnv({
    XRPL_NETWORK: NETWORK,
    TOKEN_CURRENCY,
    TOKEN_ISSUER: issuer.address,
    ISSUER_SEED: issuer.seed,
    TREASURY_SEED: treasury.seed,
    MM_SEED: marketMaker.seed,
  });
  console.log("Seeds saved to agent/.env (gitignored, testnet only).");

  await client.disconnect();
  console.log("\nSetup complete. Next: `npm run demo`.");
}

main().catch((error) => {
  console.error("Setup failed:", error.message);
  process.exit(1);
});
