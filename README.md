<div align=center>
  <img src="docs/HoldIt.png" width="128" align="center">
  <h1>HoldIt!</h1>
  <p>Stop burning treasury capital! HoldIt! is XRPL's confidential execution engine. It liquidates massive DAO positions with strict slippage control and zero market signaling via automated order slicing.</p>
</div>

## Index
- <a href="https://github.com/kotsee50-rar/HoldIt#description">Description</a>
- <a href="https://github.com/kotsee50-rar/HoldIt#features">Features</a>
- <a href="https://github.com/kotsee50-rar/HoldIt#technical-details">Technical details</a>
- <a href="https://github.com/kotsee50-rar/HoldIt#installation">Installation</a>
- <a href="https://github.com/kotsee50-rar/HoldIt#resources">Resources</a>
- <a href="https://github.com/kotsee50-rar/HoldIt#authors">Authors</a>

## Description
### The Problem: Large sales move the market
When a **DAO** sells a large token position (for example, to pay contributors), a single market order removes the best bids at once. The price falls while the order runs, and the treasury receives much less than the quoted price. On the XRPL **DEX**, the order book is public, so the size and timing of a sale are visible to everyone.

### The Solution: HoldIt!
HoldIt! sells the position in smaller chunks. Before each chunk it reads the **DEX** order book and sells only when enough liquidity is inside the mandate's price band. Each chunk is an `OfferCreate` with `tfImmediateOrCancel` and `tfSell`, and its `TakerPays` field is the minimum XRP the chunk accepts. If the price moves below that minimum, the ledger cancels the chunk and nothing is sold at a worse price.

## Features
But what does **HoldIt!** do, in simple words?
- **It limits the price impact** of a sale compared with one market order, and the minimum price on each chunk is enforced by the ledger.
- **It does not hide the position.** The order book and every transaction are public on the XRPL. Anyone can see the chunks as they execute.
- **It does not prevent front-running.** A visible sale can still be front-run. The on-chain minimum limits how far the price can be pushed against the treasury, but it does not stop the attack.
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
The pitch deck and the demo video are listed under [Resources](#resources). Setup and commands are in `agent/README.md` and `frontend/my-app/README.md`.

## Installation

You need no account and no real funds. Everything runs on the **XRP Ledger Testnet**, with test tokens that have no value.

### Requirements
- Node.js 20.19 or newer (tested with Node 24). Check with `node -v`.
- Git.
- A browser: Chrome, Edge or Firefox.
- An internet connection that can reach `wss://s.altnet.rippletest.net:51233` (the Testnet).

Commands are for macOS and Linux. On Windows, run them in PowerShell; if PowerShell blocks `npm`, use `npm.cmd` instead.

### 1. Get the code
```bash
git clone https://github.com/kotsee50-rar/HoldIt.git
cd HoldIt
```

### 2. Server side: the engine and the bridge (terminal 1)
```bash
cd agent
npm ci
npm run setup      # creates three Testnet wallets, funds them from the faucet and writes agent/.env
npm run mm -- --seed   # publishes the bid ladder once and exits
npm run doctor     # checks the setup: no [FAIL] lines expected
npm run server     # starts the bridge on http://127.0.0.1:8787 and keeps running
```
Wait for the line `Connected to wss://s.altnet.rippletest.net:51233` before going on. `npm run setup` takes about a minute. It writes `agent/.env` with Testnet seeds: keep that file private and do not commit it.

Check the bridge: open `http://127.0.0.1:8787/health`. It should show `"online":true`.

### 3. Client side: the web interface (terminal 2)
Open a new terminal in the `HoldIt` folder (the one you cloned in step 1), then:
```bash
cd frontend/my-app
npm ci
npm run dev
```
Open `http://localhost:5173` in the browser. The status bar shows **Ready** and the order book shows ten bid levels.

### 4. Try the demo
1. Click **Replay naive** and **Replay guarded**. These replay recorded runs and do not use the ledger.
2. Click **Run Market Sell (Naive)**, with the amount `100000`. Wait for **Ready**. Expected: slippage around 13–14%.
3. Click **Start protected execution**. Expected: several chunks in the terminal panel, progress 100%, slippage around 0.1%, status `completed`.

Every live run uses the Testnet. The order book is public, the way it is on the real XRP Ledger.

### Troubleshooting
| What you see | What to do |
|---|---|
| The status bar says "Bridge not connected" or "Bridge offline" | The bridge is not running, or it could not reach the Testnet. Run `npm run doctor`, then restart `npm run server` and wait for the `Connected` line. |
| The order book is empty | Run `npm run mm -- --seed` in `agent/`, then reload the page. |
| `npm run setup` fails with a faucet error | The Testnet faucet limits requests. Wait a few minutes and run `npm run setup` again. It only runs if `agent/.env` has no seeds yet. |
| Port 8787 or 5173 is already in use | Close the other program using it, or stop the earlier `npm run server` / `npm run dev`. |
| A button is grey | A run is in progress, or the bridge is offline. Wait for **Ready**. |
| Error 409 in the log | Only one run at a time: wait for the current run to finish. |

Run only one bridge at a time. Two bridges on the same Testnet accounts can interfere with each other.

### Tests (optional)
```bash
cd agent && npm test                 # 24 offline tests, no network needed
cd ../frontend/my-app && npm test    # 16 offline tests
```
The live Testnet suites (`npm run test:live`, `npm run test:adversary`) send real Testnet transactions and are not part of `npm test`.

## Resources

- <a href="https://youtu.be/BjG-kX53HP0">Demo video on Youtube</a>
- [Demo video download](https://github.com/kotsee50-rar/HoldIt/raw/main/docs/HoldIt_demo_video.mp4)
- [Pitch PDF](docs/HoldIt_pitch.pdf)

## Authors
__HoldIt!__ is a project realized for the _IXH26 Italian XRPL Hackathon_ event by the __Ghost Buggers__ team, composed by:
| Teammate | GitHub profile |
| --- | --- |
| Vincenzo Basile | **[@iamvinbas](https://github.com/iamvinbas)** |
| Andrea Cozzi | **[@kotsee50-rar](https://github.com/kotsee50-rar)** |
| Flavio Iaconeta | **[@MbeFlavj](https://github.com/mbeflavj)** |
| Marta Vitali Roscini | **[@martaspart](https://github.com/martaspart)** |
