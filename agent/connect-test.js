const xrpl = require("xrpl");

async function main() {
  // Connect to the XRPL Testnet
  const client = new xrpl.Client("wss://s.altnet.rippletest.net:51233");
  console.log("Connecting to XRPL Testnet...");
  await client.connect();
  console.log("✅ Connected!");

  // Create and fund a test wallet (the faucet gives you 1000 test XRP)
  console.log("Funding a test wallet via faucet...");
  const { wallet, balance } = await client.fundWallet();
  console.log("✅ Wallet created:", wallet.address);
  console.log("💰 Balance:", balance, "XRP");

  // Check the server info
  const serverInfo = await client.request({ command: "server_info" });
  console.log("📊 Server state:", serverInfo.result.info.server_state);
  console.log("📊 Validated ledger:", serverInfo.result.info.validated_ledger.seq);

  await client.disconnect();
  console.log("🔌 Disconnected. Setup works!");
}

main().catch((err) => {
  console.error("❌ ERROR:", err);
  process.exit(1);
});