# TreasuryGuard: frontend

Interfaccia della demo: confronto tra una vendita naive e una vendita protetta (guarded) sul testnet XRPL. Parla solo con il bridge locale (`agent/server.js`), che detiene i seed e il collegamento al ledger.

## Avvio

Serve il bridge acceso, dalla cartella `agent/`:

```bash
cd agent
npm run server          # online; oppure: npm run server -- --offline
```

Poi, in questa cartella:

```bash
npm ci
npm run dev             # http://localhost:5173
```

## Comandi

| Comando | Cosa fa |
|---|---|
| `npm run dev` | Dev server Vite su `http://localhost:5173` |
| `npm test` | Test della logica di stato e del book (`src/lib/`), senza browser né bridge |
| `npm run build` | Build di produzione in `dist/` |
| `npm run lint` | ESLint |

## Configurazione

- `VITE_BRIDGE_URL` (opzionale): indirizzo del bridge. Default `http://127.0.0.1:8787`.
- Il bridge accetta le origin `localhost:5173` e `127.0.0.1:5173` di default. Per un'altra porta, aggiungerla a `ALLOWED_ORIGINS` in `agent/.env` e riavviare il bridge.

## Struttura

| Percorso | Responsabilità |
|---|---|
| `src/lib/bridge.js` | Client HTTP e SSE verso il bridge. |
| `src/lib/runState.js` | Stato della UI, come funzione pura: traduce gli eventi del bridge. |
| `src/lib/runState.test.js` | Test di `runState.js`. |
| `src/hooks/useBridge.js` | Collega lo stream SSE allo stato React e espone `execute`. |
| `src/components/` | Barra di stato, pannello naive, pannello guarded, book (`OrderBookPanel`), barra di replay (`ReplayBar`). |
| `src/lib/book.js`, `src/hooks/useBook.js` | Righe del book da `GET /book`, aggiornato ogni 3 secondi e alla fine di ogni run. |
| `src/App.jsx` | Layout, campi importo e mandato. |

## Regole di routing degli eventi

- `run:start` e `run:end` hanno `kind: "execute"` per tutte le vendite (live e replay). I run `reset` vengono ignorati.
- Ogni evento dell'engine porta `mode` (`naive` o `guarded`). La UI instrada per `mode`, non per il pannello che ha avviato il run.
- Nel `start` della naive `maxSlippagePercent` è `null`: la UI non lo formatta come numero.
