# TreasuryGuard Agent

Execution engine di TreasuryGuard su XRPL testnet: vende grandi quantità di token
in chunk calibrati sulla profondità dell'order book, con un prezzo minimo garantito on-chain.

## Avvio rapido

Requisiti: Node.js 20.19 o superiore (richiesto da xrpl 5.x).

```bash
cd agent
npm ci              # installa le dipendenze dal lockfile
npm run setup       # crea issuer, tesoreria e market maker su testnet, salva i seed in agent/.env
npm run demo        # confronto completo: vendita naive vs TreasuryGuard
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
| Naive market sell | 100.000 TGD | 8,644 | 13,56% | 4 s |
| TreasuryGuard (max 0,5%) | 100.000 TGD | 9,988 | 0,12% | 47 s |

## Come funziona

1. **Prezzo di riferimento**: il miglior bid all'avvio (`book_offers`).
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
    // "chunk" contiene progressPct, avgPrice, slippagePct, hash...
  },
});
```

`naiveSell(client, wallet, amount)` restituisce un riepilogo con la stessa forma.
Importare i file non avvia nulla: il `main()` parte solo con `node file.js`.

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
- Senza `tfSell`, un'offerta IOC smette di vendere appena riceve `TakerPays`, anche se il prezzo è migliore.
- `wallet.sign()` restituisce `{ tx_blob, hash }`, non `tx_json`.
- L'issuer deve avere `asfDefaultRipple` **prima** che esistano le trust line, altrimenti i token non passano tra i holder.
- I codici valuta standard hanno esattamente 3 caratteri (`"TOKEN"` non è valido senza la codifica hex a 40 caratteri).
- Le offerte non bloccano gli XRP: il saldo del market maker deve coprire l'intero ladder più le riserve.
