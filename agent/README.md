# HoldIt! Agent

Execution engine di HoldIt! su XRPL testnet: vende grandi quantità di token
in chunk calibrati sulla profondità dell'order book, con un prezzo minimo garantito on-chain.

## Avvio rapido

Requisiti: Node.js 20.19 o superiore (richiesto da xrpl 5.x).

```bash
cd agent
npm ci              # installa le dipendenze dal lockfile
npm run setup       # crea issuer, tesoreria e market maker su testnet, salva i seed in agent/.env
npm run demo        # confronto completo: vendita naive vs HoldIt!
```

`npm run setup` va eseguito una volta sola: i wallet vengono riutilizzati.
`npm run setup -- --force` crea un nuovo set di wallet.

## Comandi

| Comando | Cosa fa |
|---|---|
| `npm run connect-test` | Verifica la connessione alla testnet |
| `npm run setup` | Wallet, trust line, emissione del token alla tesoreria, scrive `.env` |
| `npm run mm` | Market maker: pubblica il ladder di bid e lo ricarica di continuo (Ctrl+C per fermarlo) |
| `npm run mm -- --seed` | Pubblica il ladder una volta ed esce |
| `npm run naive -- 100000` | Vendita naive: un unico market sell |
| `npm run execute -- 100000 0.5` | Esecuzione protetta (richiede `npm run mm` in un altro terminale) |
| `npm run execute -- 100000 0.5 --with-mm` | Esecuzione protetta con il market maker nello stesso processo |
| `npm run demo` | Naive e poi protetta sullo stesso book, con tabella finale |

## Risultato di riferimento (testnet, 20/11/2026)

| | Venduti | XRP ricevuti | Slippage | Tempo |
|---|---|---|---|---|
| Naive market sell | 100.000 TGD | 8,644 | 13,56% | 7 s |
| HoldIt! (max 0,5%) | 100.000 TGD | 9,989 | 0,11% | 47 s |

Demo completa su un clone pulito di `main`, 20/11/2026: 78 s in tutto. Le cifre cambiano a ogni run, perché il book e la rete cambiano.

## Come funziona

1. **Prezzo di riferimento**: `BASE_PRICE` (il miglior bid del ladder simulato), passato da bridge, demo e CLI come `referencePrice`. Il book non sposta il floor. Senza `referencePrice`, `executeOrder` usa il miglior bid all'avvio (`book_offers`): in quel caso un book mosso prima della vendita sposta il floor, vedere `npm run test:adversary`.
2. **Prezzo minimo**: `riferimento × (1 − maxSlippage)`.
3. **Chunk adattivo**: per ogni chunk l'engine misura la liquidità sopra il prezzo minimo
   e ne prende una frazione (`PARTICIPATION`, massimo `CHUNK_MAX`). Se la liquidità non basta, aspetta che il book si ricarichi;
   dopo `LIQUIDITY_TIMEOUT_MS` si ferma con un fill parziale.
4. **Protezione on-chain**: ogni chunk è un `OfferCreate` con `tfImmediateOrCancel | tfSell`
   e `TakerPays` uguale al minimo di XRP accettato. Il ledger non esegue mai sotto il prezzo minimo,
   e la parte non eseguita viene cancellata (`tecKILLED` se non si esegue nulla). Non resta mai niente sul book.
5. **Misura reale**: XRP ricevuti e token venduti vengono letti dai metadati validati
   (`xrpl.getBalanceChanges`, con la fee riaggiunta), non stimati.

### Nota per il pitch: la liquidità è simulata

Su testnet nessuno compra il nostro token, quindi `marketMaker.js` simula i market maker:
mantiene un ladder di bid, stretto in alto e largo in basso, e **ricarica i livelli consumati agli stessi prezzi fissi**.
È questo a far sì che la vendita protetta abbia uno slippage quasi nullo: modella un mercato in cui
i market maker ripristinano la liquidità tra un chunk e l'altro. Va presentato come modello,
non come dato reale. Senza ricarica, spezzare l'ordine darebbe lo stesso prezzo medio di una vendita unica.

## Usarlo da un backend o dal frontend

```js
import { connect, loadWallets } from "./xrplHelpers.js";
import { executeOrder } from "./executeOrder.js";

const client = await connect();
const { treasury } = loadWallets();
const summary = await executeOrder(client, treasury, 100000, 0.5, {
  onEvent: (event) => {
    // event.type: "start" | "chunk" | "waiting" | "killed" | "halt" | "done"
    // event.mode: "guarded" (presente su tutti questi eventi)
    // "chunk" contiene progressPct, avgPrice, slippagePct, hash...
  },
});
```

`naiveSell(client, wallet, amount, { onEvent })` restituisce un riepilogo con la stessa forma e accetta `onEvent` allo stesso modo: emette `start`, `chunk` e `done`.

Importare `executeOrder.js`, `naiveSell.js`, `marketMaker.js` e `server.js` non avvia nulla: il `main()` parte solo con `node file.js`. `demo.js`, `setup.js`, `doctor.js` e `connect-test.js` invece eseguono il comando appena vengono importati: non importarli da altro codice.

## Configurazione

Tutti i parametri si possono cambiare in `agent/.env`: l'elenco completo, con i valori di default, è in `.env.example`.
Per accorciare la demo ci sono due strade:
- un `DEMO_AMOUNT` più piccolo;
- un `CHUNK_MAX` più grande, con livelli in alto più profondi (`LADDER_SIZES`).

`agent/.env` contiene i seed dei wallet: è in `.gitignore`. **Solo testnet**, mai seed mainnet.

## Trappole XRPL già risolte qui

- In `book_offers`, `quality` è *TakerPays/TakerGets* (qui: token per drop), **non** il prezzo in XRP per token.
  Il prezzo si calcola da `TakerGets / 1e6 / TakerPays.value`.
- Un `OfferCreate` richiede sempre entrambi gli importi: XRP va espresso in drop (stringa).
- Senza `tfSell`, un'offerta IOC si ferma appena ha ricevuto l'importo di `TakerPays`. Test del 20/11/2026: con 0,05 XRP come minimo, senza `tfSell` ha venduto 500 token; con `tfSell` ne ha venduti 1.000, cioè tutto `TakerGets`, per 0,10 XRP.
- `wallet.sign()` restituisce `{ tx_blob, hash }`, non `tx_json`.
- L'issuer imposta `asfDefaultRipple` **prima** di creare le trust line. `setup.js` rispetta questo ordine: conviene non cambiarlo.
- I codici valuta standard hanno esattamente 3 caratteri (`"TOKEN"` non è valido senza la codifica hex a 40 caratteri).
- Un'offerta non blocca gli XRP che offrirebbe, ma aumenta la riserva dell'account di 0,2 XRP. Il saldo del market maker deve quindi coprire il ladder, le riserve e le fee.

## Bridge per il frontend (`npm run server`)

`server.js` espone l'engine via HTTP e Server-Sent Events, senza dipendenze extra. Ascolta su `http://127.0.0.1:8787`.

| Endpoint | Cosa fa |
|---|---|
| `GET /health` | Stato: online o offline, occupato o libero, run corrente, ultimo run concluso |
| `GET /book` | Bid del token sul testnet e configurazione del ladder. Offline: ladder configurato, con `offline: true` |
| `POST /reset` | Ripristina il ladder del market maker (asincrono, risponde `202`) |
| `POST /execute` | Body `{ "mode": "naive" \| "guarded", "amount", "maxSlippage", "reset" }`, risponde `202` |
| `POST /replay` | Riproduce una registrazione curata, senza ledger. Body `{ "name", "speed" }`, risponde `202` |
| `GET /events` | Stream SSE: `hello`, `run:start`, `seeding`, eventi dell'engine, `run:end` |

Esempio dal browser:

```js
const events = new EventSource("http://127.0.0.1:8787/events");
events.onmessage = (e) => {
  const ev = JSON.parse(e.data);
  if (ev.type === "chunk") console.log(ev.progressPct, ev.slippagePct);
};
await fetch("http://127.0.0.1:8787/execute", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ mode: "naive", amount: 100000 }),
});
```

Flusso della demo: `POST /execute` con `mode: "naive"` (ripristina il ladder, vende), poi `POST /execute` con `mode: "guarded"` (ripristina il ladder, avvia il market maker, vende).
Un solo run alla volta: una seconda richiesta durante un run riceve `409`.
Il server accetta richieste solo senza `Origin` (curl, script) o da `ALLOWED_ORIGINS` (default `localhost:3000`).
Con `SERVER_HOST` lasciato al default il server non è raggiungibile dalla rete.

Note per il frontend:
- Origin consentiti di default: `localhost` e `127.0.0.1` sulle porte 3000 e 5173 (default di Vite). Per un'altra porta, aggiungerla a `ALLOWED_ORIGINS` in `.env`.
- Una pagina HTML aperta da file invia `Origin: null` e riceve `403`. Servi la pagina con un server locale.
- Un `403` non espone l'header CORS, quindi il browser nasconde il corpo: il motivo è scritto nel log del server.
- `POST /reset`, `POST /execute` e `POST /replay` richiedono `Content-Type: application/json`, anche con body `{}`.
- Il campo `reset` vale solo per `mode: "naive"`. La guarded riparte sempre da un ladder nuovo.
- Prima di ogni run arriva un evento `seeding`: il ripristino del ladder dura circa 8-10 s sulla testnet, quindi mostra "preparazione mercato".
- Ogni evento dell'engine porta `mode` (`naive` o `guarded`): instrada gli eventi per `mode`, non per la pagina che li riceve.
- La vendita naive emette `start`, `chunk` (un solo chunk al 100%) e `done`, con la stessa forma della guarded.
- Nel `start` della naive, `maxSlippagePercent` è `null`: non c'è floor. Non usarlo con `.toFixed()` senza controllo.
- Per il pannello del book, fai polling di `GET /book`.
- Il server ricarica la tesoreria automaticamente se il saldo non basta: il run non viene rifiutato.

## Controlli

- `npm test`: test automatici offline (funzioni di conversione, validazione e controllo accessi del bridge). Non toccano il ledger.
- `npm run test:live`: 5 test sul testnet. Verificano il ladder, una vendita guarded da 1.000 token con prezzo minimo rispettato su ogni chunk, direttamente sul ledger (senza engine) che un ordine con floor si ferma a L1 con fill parziale e che un ordine con floor sopra il miglior bid viene ucciso, e che la naive emette eventi coerenti con il riepilogo. Invia transazioni reali, richiede `agent/.env` e dura circa 55 secondi. Non è incluso in `npm test`.
- `npm run test:adversary`: 3 test sul testnet. Un attaccante svuota i bid prima di una vendita guarded: con il riferimento ancorato al prezzo base la vendita si ferma senza vendere sotto il floor; con il riferimento di default il floor si sposta, e il test lo documenta. Invia transazioni reali, circa 90 secondi. Non è incluso in `npm test`.
- `npm run doctor`: controllo prima della demo. Verifica Node, dipendenze, `.env`, connessione al testnet, saldi, order book e stato del bridge. Esce con codice 1 se c'è un blocco; i warning sono informativi.

## Replay (piano B per la demo)

`POST /replay` riproduce un run registrato, con gli stessi eventi e la stessa temporizzazione del run originale. Non tocca il ledger: funziona anche se la testnet non risponde. Il replay ha la stessa forma di un run dal vivo: `kind: "execute"` e `params` con `mode`, `amount`, `maxSlippage` più `replay` (il nome della registrazione) e `speed`. Il frontend non ha bisogno di un caso speciale.

```bash
curl -s -XPOST http://127.0.0.1:8787/replay -H 'Content-Type: application/json' \
  -d '{"name":"demo-guarded","speed":1}'
```

- `name` è il nome del file in `agent/recordings/` senza `.json`. Sono ammessi solo lettere, cifre e trattini.
- `speed` (da 0 a 100, default 1) divide la durata. Le pause lunghe, come il ripristino del ladder, vengono accorciate a 2,5 s.
- Demo incluse: `demo-naive` e `demo-guarded`.
- Ogni run dal vivo viene salvato in `agent/recordings/live/` (gitignored). Per aggiornare una demo, copiare un file da `live/` in `recordings/`.

### Modalità offline

`npm run server -- --offline` avvia il bridge senza contattare la testnet. Senza il flag, il server prova a connettersi per 10 s e, se fallisce, parte comunque in modalità offline.

In modalità offline:
- `/health`, `/events` e `/replay` funzionano.
- `GET /book` restituisce il ladder configurato, con `offline: true`, così il pannello pubblico resta popolato.
- `POST /execute` e `POST /reset` rispondono `503`: il messaggio indica di usare `/replay`.
- Il server resta offline finché non viene riavviato. Riavviarlo con la rete disponibile lo riporta online.
