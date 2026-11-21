<div align=center>
  <img src="images/HoldIt!.png" width="128" align="center">
  <h1>HoldIt!</h1>
  <p>HoldIt! is an execution engine for DAO treasuries on the XRP Ledger. It sells a large token position in depth-aware chunks, with an on-chain minimum price on every chunk, and it shows the result next to a naive single market sell.</p>
</div>

## Index
- <a href="https://github.com/kotsee50-rar/HoldIt#description">Description</a>
- <a href="https://github.com/kotsee50-rar/HoldIt#what-it-does-and-what-it-does-not">What it does and what it does not</a>
- <a href="https://github.com/kotsee50-rar/HoldIt#technical-details">Technical details</a>
- <a href="https://github.com/kotsee50-rar/HoldIt#authors">Authors</a>

## Description
### The Problem: Large sales move the market
When a **DAO** sells a large token position (for example, to pay contributors), a single market order removes the best bids at once. The price falls while the order runs, and the treasury receives much less than the quoted price. On the XRPL **DEX**, the order book is public, so the size and timing of a sale are visible to everyone.

### The Solution: HoldIt!
HoldIt! sells the position in smaller chunks. Before each chunk it reads the **DEX** order book and sells only when enough liquidity is inside the mandate's price band. Each chunk is an `OfferCreate` with `tfImmediateOrCancel` and `tfSell`, and its `TakerPays` field is the minimum XRP the chunk accepts. If the price moves below that minimum, the ledger cancels the chunk and nothing is sold at a worse price.

## What it does and what it does not
- **It limits the price impact** of a sale compared with one market order, and the minimum price on each chunk is enforced by the ledger.
- **It does not hide the position.** The order book and every transaction are public on the XRPL. Anyone can see the chunks as they execute.
- **It does not prevent front-running.** A visible sale can still be front-run. The on-chain minimum limits how far the price can be pushed against the treasury, but it does not stop the attack. See `docs/PITCH_MEV_NOTE.md`.
- **Both sales are measured against the mandate's reference price** (`BASE_PRICE`), not against the book. The engine's default (no anchor) uses the best bid at the start; that default is a known limit, see `agent/test/adversary.live.test.js`.
- **It runs on the XRPL testnet.** The demo uses simulated tokens and a simulated market maker. It is not connected to a live market and is not audited.

## Technical details

**HoldIt!** (XRPL testnet) compares a naive market sale with a guarded sale on the same order book.

### Architecture
- `agent/`: Node ESM engine. `setup.js` creates the issuer, treasury and market-maker wallets, sets `DefaultRipple`, trust lines and the initial mint. `marketMaker.js` seeds and refills a 10-level bid ladder. `naiveSell.js` makes one IOC market sell. `executeOrder.js` runs the guarded sale. `server.js` is a Node `http` bridge with SSE (`/health`, `/book`, `/reset`, `/execute`, `/replay`). `doctor.js` checks the setup before a demo.
- `frontend/my-app/`: React and Vite interface. It shows the order book and the two runs side by side, and it replays recorded runs.
- Tech: Node.js (ESM), xrpl.js, dotenv, React, Vite, Tailwind CSS.

### Guarded sale
The engine reads the book and sets `floor = reference × (1 − maxSlippage)`. It waits until enough liquidity is inside the band, then sends `OfferCreate` with `tfImmediateOrCancel | tfSell` and `TakerPays` set to the chunk's minimum. It parses the fills from the validated metadata. It halts on timeout or after 5 consecutive killed chunks. The market maker refills the bids at fixed prices, and the bridge streams the events to the frontend.

### Recordings and replay
Live runs are saved under `agent/recordings/live/` (not committed). Two curated runs are committed as `agent/recordings/demo-naive.json` and `demo-guarded.json`. The replay endpoint plays them back without contacting the ledger, so the demo keeps working if the testnet is slow.

### Testing
- `agent`: 24 offline tests (`npm test`), 5 live testnet tests (`npm run test:live`), 3 adversary tests on the testnet (`npm run test:adversary`).
- `frontend`: 16 unit tests (`npm test`) and 6 browser tests (`npm run test:e2e`, needs the bridge and the dev server running).

### Running the demo
See `docs/DEMO_RUNBOOK.md` for the checklist and `docs/PROJECT_GUIDE.md` for a full walkthrough. Setup and commands are in `agent/README.md` and `frontend/my-app/README.md`.

## Authors
__HoldIt!__ is a project realized for the _IXH26 Italian XRPL Hackathon_ event by the __Ghost Buggers__ team, composed by:
- Vincenzo Basile
- Andrea Cozzi
- Flavio Iaconeta
- Marta Vitali Roscini
