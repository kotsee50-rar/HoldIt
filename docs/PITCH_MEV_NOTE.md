# Nota per il pitch: front-running e MEV su XRPL

Destinatari: chi scrive e presenta il pitch. Scopo: verificare la frase sul front-running e dare formulazioni sicure. Data della verifica: 20/11/2026.

## Cosa risulta

- **Il tema è pubblico.** A giugno 2026 si discute di rischi di front-running e sandwich su XRPL, che riguarderebbero pagamenti, offer crossing, DEX e AMM.
- **La posizione critica** (riportata dalla stampa, attribuita a XRPresso): validatori e nodi ben connessi possono vedere le transazioni in coda prima della validazione e inviare le proprie per ottenere una posizione migliore.
- **La posizione di David Schwartz** (ex CTO di Ripple, riportata dalla stampa): il rischio è reale ma sovrastimato. Un validatore non può fare front-running senza lasciare prove pubbliche e tracciabili, e questo non serve se più validatori non collaborano. Propone un meccanismo di prenotazione delle transazioni (`ReservedTxns`, secondo la stampa). Non è ancora un emendamento formale.
- **L'ordinamento** è descritto dalla documentazione della coda come basato sul costo della transazione. Non ho trovato una fonte ufficiale che dica esplicitamente se esiste o no un mempool pubblico. Il termine "mempool" del pitch va evitato finché non c'è la fonte.
- **La ricerca accademica** su front-running e sandwich riguarda soprattutto Ethereum (per esempio *Flash Boys 2.0*). Non ho trovato studi specifici su XRPL.

## Affidabilità delle fonti

- Ho letto titoli ed estratti dei risultati di ricerca, non le pagine complete.
- Le fonti dell'elenco sotto sono in gran parte articoli di stampa su post social. Riportano affermazioni di terzi.
- Le fonti primarie (post originali di Schwartz, documentazione xrpl.org attuale, codice rippled) non sono state controllate in questa verifica.

## Cosa dire

- "Il dibattito sul front-running su XRPL è aperto. Il nostro progetto non lo risolve: limita il danno sul prezzo."
- "Il ledger non esegue la nostra vendita sotto il prezzo minimo. Un attacco di ordinamento può ridurre la quantità eseguita, non farci vendere a un prezzo peggiore del limite." Questo è verificato: nel test live l'ordine con floor tra L1 e L2 si ferma a L0 + L1, e nessun chunk viene eseguito sotto il floor.
- "Il nostro ordine non è nascosto: book e transazioni sono pubblici."

## Cosa non dire

- "XRPL non ha MEV" oppure "XRPL è immune al front-running".
- "Le transazioni sono private" o "l'ordine è nascosto".
- "Come su Ethereum, i bot ...", senza una fonte su XRPL.
- "Eliminiamo il front-running" o "il sistema è resistente al MEV".
- Usare i numeri della demo come misura di protezione reale.

## Limite da dichiarare

La demo non include un avversario. Il market maker è controllato dal progetto e ricarica i livelli a prezzi fissi, quindi nessun bot anticipa le nostre vendite. La demo mostra il meccanismo del floor e del chunking, non la resistenza a un bot reale. Conviene dirlo prima che lo chieda un giudice.

## Prossimi passi per chi scrive il pitch

1. Leggere il post originale di Schwartz e la risposta di XRPresso, dalle fonti primarie.
2. Controllare la documentazione attuale di xrpl.org su coda delle transazioni e costo delle transazioni.
3. Scegliere la frase definitiva. Se cambia la sostanza, aggiornare anche `docs/PROJECT_GUIDE.md`, sezione 11.

## Fonti

Stampa, sul dibattito di giugno 2026:
- [Schwartz propone una correzione per XRPL mentre tornano i timori di front-running](https://crypto.news/schwartz-proposes-xrpl-fix-as-front-running-fears-return/)
- [XRP Ledger, rischio di sandwich attack e proposta di correzione](https://beincrypto.com/xrp-ledger-sandwich-attack-schwartz-fix/)
- [Schwartz: il rischio di front-running su XRP Ledger è reale ma sovrastimato](https://bitcoinist.com/david-schwartz-says-xrp-ledger-front-running-risk-is-real-but-overstated-3/amp/)
- [Ex CTO di Ripple avverte: l'ordinamento proposto per XRPL potrebbe creare nuovi rischi](https://www.kucoin.com/news/flash/ripple-cto-emeritus-warns-proposed-xrpl-transaction-ordering-could-create-new-risks)

Documentazione XRPL:
- [Transaction queue](https://xrpl.org/transaction-queue.html)
- [Transaction cost](https://xrpl.org/transaction-cost.html)

Ricerca accademica (Ethereum, come contesto):
- [Flash Boys 2.0: Frontrunning, Transaction Reordering, and Consensus Instability in Decentralized Exchanges](https://arxiv.org/pdf/1904.05234)
