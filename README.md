<div align=center>
  <img src="images/HoldIt!.png" width="128" align="center">
  <h1>HoldIt!</h1>
  <p>Stop burning treasury capital! HoldIt! is XRPL's confidential execution engine. It liquidates massive DAO positions with strict slippage control and zero market signaling via automated order slicing.</p>
</div>

## Index
- <a href="https://github.com/kotsee50-rar/HoldIt#description">Description</a>
- <a href="https://github.com/kotsee50-rar/HoldIt#technical-details">Technical details</a>
- <a href="https://github.com/kotsee50-rar/HoldIt#authors">Authors</a>

## Description
###  The Problem: The Transparency Penalty on Public Ledgers
When a **DAO** decides to liquidate a large token position (e.g., to pay contributors), a single large market order instantly signals intent. Front-running bots and market makers step in, the order book collapses, and slippage can easily destroy 10% to 20% of the treasury's capital before the transaction settles. On a transparent **DEX** like XRPL, there was no native, institutional-grade tool to execute large orders without moving the market against you.
### The Solution: HoldIt!
**HoldIt!** is a non-custodial, **B2B** execution engine for **DAOs** and corporate treasuries on the XRP Ledger. It allows a treasury to set a confidential mandate (e.g., "Sell 20,000 tokens, but accept no more than 0.5% slippage"). Instead of a single market dump, HoldIt! automatically slices the order into depth-aware micro-transactions. The engine constantly monitors the XRPL **DEX** order book and executes chunks only when the liquidity is optimal, ensuring the treasury's capital is protected while the full position size remains hidden from the public eye.
### Technical Architecture & Implementation
HoldIt! is not just a trading script; it is a fully-fledged, native XRPL application.
- **On-Chain Price Floors** (The Ledger as Guardian): Every chunk executed is an OfferCreate transaction using the tfImmediateOrCancel and tfSell flags. We set a strict TakerPays (minimum acceptable price) for each chunk. If the market crashes mid-execution, the XRPL consensus natively kills the transaction. The ledger itself enforces the mandate.
- **Dynamic Order Slicing**: The backend (Node.js) continuously polls the **DEX** to calculate the absolute maximum safe chunk size based on real-time order book depth. We even implemented an "in-band liquidity" check: if the book is too thin, **HoldIt!** pauses and waits for the market to refill before continuing.
- **Real-Time Mission Control Bridge**: The backend communicates with the React frontend via an **HTTP/SSE** (Server-Sent Events) bridge. We built a custom server that streams execution logs in real-time, allowing the UI to visualize a side-by-side comparison: the "Naive Way" (a single order destroying value) vs. the **HoldIt! Engine** (preserving capital chunk-by-chunk).
- **Demo Resilience** (Replay Mode): To ensure a flawless pitch, our bridge automatically records live runs. If the testnet experiences latency during the presentation, the /replay endpoint can stream the recorded events natively to the frontend.
- **Complete Test Environment**: We built a custom setup.js to mint test tokens, establish trustlines, and configure DefaultRipple. We also engineered a background Market Maker (marketMaker.js) that seeds and automatically refills a bid ladder, allowing us to simulate a realistic, volatile market environment for our tests. A doctor.js CLI utility ensures all nodes, wallets, and dependencies are healthy before the demo.
### Why XRPL?
XRPL's 3-5 second deterministic finality and negligible fees make it the only blockchain capable of executing high-frequency, micro-transaction slicing natively without burning capital on gas fees. **HoldIt!** turns XRPL's native **DEX** into a safe, execution-friendly environment for institutional liquidity.

## Technical details

**HoldIt!** (XRPL testnet) compares naive vs guarded token sales.
### Architecture:
Config/helpers; setup creates issuer/treasury/MM wallets, *DefaultRipple*, trustlines, mint; *marketMaker* seeds/refills a 10-level bid ladder; *naiveSell* does one IOC market sell; *executeOrder* sells depth-aware chunks; *Node http/SSE bridge* (/health,/book,/reset,/execute,/replay); doctor, demo, recordings. Tech: *Node ESM*, *xrpl.js*, *dotenv*, built-in http/fs/crypto.
### Challenges:
On-chain slippage floor via *TakerPays*, batched sequence-derived tx submission, validated-metadata fill parsing, *DefaultRipple*-before-trustlines ordering, IOU/drop precision, single-run lock, offline replay.
### Beneath the surface:
Guarded engine reads book, computes `floor=ref(1-slip)`
, waits for in-band liquidity, sends *OfferCreate tfImmediateOrCancel|tfSell* with `TakerPays=chunkfloor`, parses fills, halts on timeout/5 kills. MM refills fixed-price bids; SSE streams events; recordings replay without ledger.

## Authors
__HoldIt!__ is a project realized for the _IXH26 Italian XRPL Hackathon_ event by the __Ghost Buggers__ team, composed by:
- Vincenzo Basile
- Andrea Cozzi
- Flavio Iaconeta
- Marta Vitali Roscini
