# Runbook della demo TreasuryGuard

Checklist operativa per il giorno della demo. Per capire il progetto leggere prima [`PROJECT_GUIDE.md`](PROJECT_GUIDE.md); per i dettagli dei comandi, [`agent/README.md`](../agent/README.md).

Il frontend MVP è incluso in `frontend/my-app/`; per avviarlo seguire anche [`frontend/my-app/README.md`](../frontend/my-app/README.md). Mostra il book, i pannelli naive/guarded e i pulsanti per le registrazioni replay. Il book offline è un ladder statico, non un dato live.

---

## 1. Cosa serve

- Un computer con **Node.js 20.19 o superiore** e connessione internet stabile. Disattivare la sospensione.
- Il repo aggiornato a `main`, con `agent/` e `frontend/my-app/` installati (`npm ci` in entrambe le cartelle).
- Il file `agent/.env` con i seed del gruppo. Va ricevuto in privato, mai da git.
- La porta del dev server frontend (default Vite: `5173`, già consentita dal bridge); per porte diverse aggiornare `ALLOWED_ORIGINS`.
- Un video registrato della demo, come piano di emergenza.

---

## 2. Il giorno prima

Eseguire nell'ordine indicato, dalla cartella `agent/`.

| Passo | Comando | Esito atteso |
|---|---|---|
| Aggiornare e installare | `git switch main && git pull`; poi `npm ci` in `agent/` e `frontend/my-app/` | Nessun errore |
| Test agente offline | `npm test` da `agent/` | 23 test passati |
| Test frontend offline | `npm test` da `frontend/my-app/` | 16 test passati |
| Build frontend | `npm run build` da `frontend/my-app/` | Build completata |
| Test sul testnet | `npm run test:live` | 5 test passati, circa 55 secondi |
| Test avversario (facoltativo) | `npm run test:adversary` da `agent/` | 3 test passati, circa 90 secondi |
| Test nel browser (facoltativo) | `npm run test:e2e` da `frontend/my-app/`, con bridge e dev server accesi | 6 test passati |
| Controllo pre-demo | `npm run doctor` | "Ready" o solo warning; nessun ❌ |
| Prova della demo | Eseguire il flusso completo dal frontend | Naive e guarded completate |
| Registrare il video di backup | Screen recording della prova completa | File salvato in un posto sicuro |

Se `test:live` o `doctor` mostrano un ❌, non andare avanti: vedere la sezione 6.

**Nota:** `npm run test:live` consuma liquidità del ladder e lo ripristina alla fine. Non eseguirlo a ridosso della demo, per non interferire con un run in corso.

---

## 3. Mezz'ora prima

1. Chiudere le altre app pesanti e disattivare la sospensione.
2. Verificare la connessione: `npm run doctor`.
3. Avviare il bridge online:
   ```bash
   npm run server
   ```
   Nel log deve comparire `Connected to wss://s.altnet.rippletest.net:51233`. Controllare anche:
   ```bash
   curl -s http://127.0.0.1:8787/health
   ```
   Deve restituire `"online":true` e `"busy":false`.
4. Avviare la UI dalla cartella `frontend/my-app/` con `npm ci` (una volta) e `npm run dev`. Aprire `http://localhost:5173` e verificare stato bridge, campi importo/mandato, pannelli naive/guarded, book e pulsanti replay.
5. Tenere un solo processo di market maker. **Non** lanciare `npm run mm` in un altro terminale mentre il bridge è acceso: il bridge gestisce già il market maker durante le vendite, e due processi sugli stessi offer si sovrascrivono.
6. **Non** lanciare `npm run setup -- --force` il giorno della demo: crea nuovi wallet e il frontend non vedrebbe più lo stesso token.

---

## 4. Sequenza sul palco

Usare sempre `reset` attivo per la vendita naive: il ladder deve partire pieno, altrimenti la naive mostra uno slippage più basso del reale.

| Fase | Azione dal frontend | Durata circa | Da dire |
|---|---|---|---|
| 1. Il problema | Mostrare il book e indicare la profondità disponibile | 30 s | Le DAO perdono valore quando vendono in blocco. |
| 2. Il disastro | Vendita naive di 100.000 TGD | 15 s | Lo slippage è circa 13–14%. |
| 3. La soluzione | Vendita guarded con mandato 0,5% | 45–50 s | Lo slippage è circa 0,1%: vendita a chunk, con prezzo minimo sul ledger. |
| 4. Il messaggio | Confronto finale | 60 s | La liquidità è simulata: vedi la sezione 7. |

Il run completo dura circa 65–90 secondi. Il frontend deve aspettare `run:end` prima di avviare il run successivo: un secondo `POST /execute` mentre il primo è in corso riceve `409`.

---

## 5. Piani di emergenza

**Piano A: testnet funziona.** Demo dal vivo, come sopra.

**Piano B: la rete cade prima o durante la demo.**
1. Fermare il bridge (`Ctrl+C`).
2. Riavviarlo offline:
   ```bash
   npm run server -- --offline
   ```
   Il log deve dire `--offline: testnet not contacted`. Se invece la connessione fallisce, il log dice `Testnet unavailable` e `Starting OFFLINE`.
3. Usare i pulsanti “Replay naive” e “Replay guarded” del frontend, oppure da un terminale riprodurre le registrazioni in sequenza. La UI ricostruisce la vista dagli eventi SSE di `/events` (`run:start`, `chunk`, `run:end`), anche quando il replay viene avviato da curl:
   ```bash
   curl -s -XPOST http://127.0.0.1:8787/replay -H 'Content-Type: application/json' -d '{"name":"demo-naive","speed":1}'
   ```
   Aspettare che `/health` torni `"busy":false`, poi:
   ```bash
   curl -s -XPOST http://127.0.0.1:8787/replay -H 'Content-Type: application/json' -d '{"name":"demo-guarded","speed":1}'
   ```
   Durata approssimativa: naive circa 5 s, guarded circa 20 s. Il replay accorcia le attese, quindi dirlo sul palco.
4. Il pannello pubblico usa il ladder statico (`offline: true`). Va detto che è una ricostruzione, non il book in tempo reale.

**Piano C: tutto cade, incluso il computer.** Mostrare il video di backup e spiegare il meccanismo con il diagramma di `PROJECT_GUIDE.md`.

**Un run live fallisce a metà.** Il run termina con `run:end` e `ok: false`. Controllare `/health`: `busy` deve tornare `false`. Poi decidere se riprovare o passare al piano B. Non avviare un nuovo run finché `busy` è `true`.

---

## 6. Problemi noti e soluzione

| Sintomo | Causa probabile | Soluzione |
|---|---|---|
| Il frontend mostra errore CORS o `403` | Origin del frontend non in `ALLOWED_ORIGINS` | Aggiungere la porta a `agent/.env`, poi riavviare il bridge |
| Pagina aperta da file (`file://`) | Il browser invia `Origin: null` | Servire la pagina con un server locale |
| `503` su `/execute` | Bridge offline | Piano B, oppure riavviare il bridge con la rete disponibile |
| `409` su `/execute` | Un run è ancora in corso | Aspettare `run:end` |
| `Missing seeds` | `agent/.env` mancante o con nome sbagliato (`.env.txt`) | Ricopiare il file del gruppo come `agent/.env` |
| Il doctor segnala il market maker con poco XRP | Le vendite consumano XRP del market maker | Il ladder lo rifinanzia dal faucet all'avvio. Se il faucet è rate-limited, usare il piano B |
| Il doctor segnala il book vuoto | Il ladder è stato consumato dalle prove | Va bene per la demo: il bridge ripubblica il ladder da solo |
| Slippage della naive troppo basso | La naive è partita senza `reset` su un ladder già consumato | Rifare la prova con `reset: true` |
| `Testnet unavailable` all'avvio | Rete o faucet non raggiungibili | Usare il piano B |

---

## 7. Cosa dichiarare sul palco

- **La liquidità è simulata.** Un market maker controllato dal progetto mantiene il ladder e lo ricarica ai prezzi configurati. Non è un mercato reale con altri operatori.
- **I numeri sono di una prova su testnet**, non una garanzia per un run nuovo. I valori di riferimento sono 13,56% per la naive e circa 0,1% per la guarded, con mandato 0,5%.
- **La protezione è sul ledger.** Ogni chunk ha un prezzo minimo: il ledger non esegue sotto quella soglia. Il motore non si basa solo su un controllo lato applicazione.
- **Non dire che il sistema è resistente al MEV o al front-running.** Le transazioni e il book sono pubblici; la demo mostra il limite di prezzo, non l'invisibilità dell'ordine. Per le formulazioni sicure e il dibattito su XRPL, vedere `docs/PITCH_MEV_NOTE.md`.
- **Se si usa il replay**, dirlo apertamente: la demo è riprodotta da una registrazione, non eseguita in tempo reale.

---

## 8. Ruoli il giorno della demo

Completare la tabella prima della prova generale.

| Ruolo | Persona | Responsabilità |
|---|---|---|
| Bridge e terminale | | Avvio del server, controllo di `/health`, piano B |
| Frontend | | Pagina, avvio dei run, stato visibile |
| Parlato | | Sezioni 1–4 e messaggi della sezione 7 |
| Backup | | Video pronto, avvio del piano C se serve |

---

## 9. Dopo la demo

- Non cancellare `agent/.env`: serve per la prossima prova.
- Le registrazioni dal vivo finiscono in `agent/recordings/live/`, escluse da git. Se una run è riuscita bene, copiarla in `agent/recordings/` come nuova demo, tramite PR.
- Annotare nel repo eventuali problemi incontrati, in una issue o in una PR di documentazione.
