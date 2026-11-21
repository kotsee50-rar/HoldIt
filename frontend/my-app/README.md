# HoldIt!: frontend

Demo interface: comparison between a naive market sale and a protected (guarded) sale on the XRPL testnet. It talks only to the local bridge (`agent/server.js`), which holds the seeds and the ledger connection.

## Running it

The bridge must be running, from the `agent/` folder:

```bash
cd agent
npm run server          # online; or: npm run server -- --offline
```

Then, in this folder:

```bash
npm ci
npm run dev             # http://localhost:5173
```

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server on `http://localhost:5173` |
| `npm test` | Tests for the state logic and the order book (`src/lib/`), no browser or bridge needed |
| `npm run build` | Production build in `dist/` |
| `npm run lint` | ESLint |
| `npm run test:e2e` | Browser tests (Chrome): needs the bridge and the dev server running. Runs a live sale of 1,000 TGD on the testnet. Not part of `npm test`. |

## Configuration

- `VITE_BRIDGE_URL` (optional): address of the bridge. Default `http://127.0.0.1:8787`.
- The bridge accepts the origins `localhost:5173` and `127.0.0.1:5173` by default. For another port, add it to `ALLOWED_ORIGINS` in `agent/.env` and restart the bridge.

## Structure

| Path | Responsibility |
|---|---|
| `src/lib/bridge.js` | HTTP and SSE client for the bridge. |
| `src/lib/runState.js` | UI state as a pure function: translates the bridge events. |
| `src/lib/runState.test.js` | Tests for `runState.js`. |
| `src/hooks/useBridge.js` | Connects the SSE stream to the React state and exposes `execute`. |
| `src/components/` | Status bar, naive panel, guarded panel, order book (`OrderBookPanel`), replay bar (`ReplayBar`). |
| `src/lib/book.js`, `src/hooks/useBook.js` | Order book rows from `GET /book`, refreshed every 3 seconds and at the end of each run. |
| `src/lib/format.js` | Number format for the UI (English grouping, e.g. 100,000). |
| `src/App.jsx` | Layout, amount and mandate fields. |

## Event routing rules

- `run:start` and `run:end` have `kind: "execute"` for every sale (live and replay). `reset` runs are ignored.
- Every engine event carries `mode` (`naive` or `guarded`). The UI routes by `mode`, not by the panel that started the run.
- In the naive `start` event `maxSlippagePercent` is `null`: the UI does not format it as a number.
